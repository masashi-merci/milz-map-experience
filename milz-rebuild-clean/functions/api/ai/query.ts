import { createClient } from "@supabase/supabase-js";
import { json } from "../../_shared/response";

type RequestBody = {
  mode: "recommendation" | "trend";
  regionKey: string;
  country: string;
  state: string;
  cityArea: string;
  landmark?: string;
};

type GeocodeResult = {
  lat: number;
  lng: number;
  displayName: string;
};

type SuggestResponse = [string, string[]];

type RecommendationItem = {
  id: string;
  title: string;
  description: string;
  address?: string;
  lat: number;
  lng: number;
  source: 'spot' | 'places';
};

type TrendItem = {
  id: string;
  keyword: string;
  reason: string;
  sourceUrl?: string;
};

const RECOMMEND_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const TREND_TTL_MS = 24 * 60 * 60 * 1000;
const USER_AGENT = 'Milz Map X Experience/1.0';

const supabaseUrl = (globalThis as any).process?.env?.SUPABASE_URL || (globalThis as any).SUPABASE_URL;
const supabaseServiceRoleKey = (globalThis as any).process?.env?.SUPABASE_SERVICE_ROLE_KEY || (globalThis as any).SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseServiceRoleKey ? createClient(supabaseUrl, supabaseServiceRoleKey) : null;

export const onRequestPost: PagesFunction = async ({ request }) => {
  try {
    const body = (await request.json()) as RequestBody;
    if (!body.country || !body.state || !body.cityArea) {
      return json({ error: 'country / state / cityArea は必須です。' }, 400);
    }

    const regionKey = buildRegionKey(body);
    if (body.mode === 'recommendation') {
      const cached = await readCache('recommendation', regionKey);
      if (cached) return json({ data: cached });
      const data = await buildRecommendations(body);
      await writeCache('recommendation', regionKey, data, RECOMMEND_TTL_MS);
      return json({ data });
    }

    const cached = await readCache('trend', regionKey);
    if (cached) return json({ data: cached });
    const data = await buildTrends(body);
    await writeCache('trend', regionKey, data, TREND_TTL_MS);
    return json({ data });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'AI query failed' }, 500);
  }
};

function buildRegionKey(body: RequestBody) {
  return [body.country, body.state, body.cityArea, body.landmark || '']
    .map(normalizeForKey)
    .join('|');
}

function normalizeForKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function readCache(cacheType: 'recommendation' | 'trend', regionKey: string) {
  if (!supabase) return null;
  const { data } = await supabase
    .from('ai_cache')
    .select('payload_json, expires_at')
    .eq('cache_type', cacheType)
    .eq('region_key', regionKey)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data.payload_json;
}

async function writeCache(cacheType: 'recommendation' | 'trend', regionKey: string, payload: unknown, ttlMs: number) {
  if (!supabase) return;
  await supabase.from('ai_cache').upsert({
    cache_type: cacheType,
    region_key: regionKey,
    payload_json: payload,
    expires_at: new Date(Date.now() + ttlMs).toISOString(),
  }, { onConflict: 'cache_type,region_key' });
}

async function buildRecommendations(body: RequestBody) {
  const geocode = await geocodeLocation(body);
  const sightseeing = await getNearbyRecommendations(body, geocode, 'sightseeing');
  const food = await getNearbyRecommendations(body, geocode, 'food');
  return {
    sightseeing: sightseeing.slice(0, 5),
    food: food.slice(0, 5),
  };
}

async function geocodeLocation(body: RequestBody): Promise<GeocodeResult> {
  const q = [body.landmark, body.cityArea, body.state, body.country].filter(Boolean).join(' ');
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&accept-language=ja&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error('Geocode failed');
  const rows = await res.json() as any[];
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('指定地域を geocode できませんでした。');
  const row = rows[0];
  return { lat: Number(row.lat), lng: Number(row.lon), displayName: row.display_name || q };
}

async function getNearbyRecommendations(body: RequestBody, center: GeocodeResult, kind: 'sightseeing' | 'food'): Promise<RecommendationItem[]> {
  const admin = await getAdminSpots(body, center, kind);
  const osm = await getOsmPlaces(center, kind);
  const merged = dedupeRecommendationItems([...admin, ...osm])
    .map((item) => ({ ...item, distance: distanceKm(center.lat, center.lng, item.lat, item.lng) }))
    .filter((item) => item.distance <= maxDistanceKm(kind, body))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5)
    .map(({ distance, ...item }) => item);
  return merged;
}

function maxDistanceKm(kind: 'sightseeing' | 'food', body: RequestBody) {
  const city = body.cityArea;
  const wide = /(マンハッタン|ニューヨーク|ハワイ|ソウル|大阪市|京都市|東京|new york|manhattan|seoul|honolulu)/i.test(city);
  if (kind === 'food') return wide ? 3.5 : 2.2;
  return wide ? 5.5 : 3.2;
}

async function getAdminSpots(body: RequestBody, center: GeocodeResult, kind: 'sightseeing' | 'food'): Promise<RecommendationItem[]> {
  if (!supabase) return [];
  const categories = kind === 'food' ? ['food'] : ['sightseeing', 'other'];
  const { data } = await supabase
    .from('spots')
    .select('id,title,description,address,lat,lng,category,city,region,country')
    .in('category', categories)
    .eq('country', body.country)
    .eq('region', body.state)
    .ilike('city', `%${body.cityArea}%`)
    .limit(30);
  if (!data) return [];
  return data.map((row: any) => ({
    id: `spot:${row.id}`,
    title: row.title,
    description: row.description || buildRecommendationDescription(row.title, row.address || `${row.city}`, kind, 0),
    address: row.address || `${row.city}, ${row.region}`,
    lat: Number(row.lat),
    lng: Number(row.lng),
    source: 'spot' as const,
  }));
}

async function getOsmPlaces(center: GeocodeResult, kind: 'sightseeing' | 'food'): Promise<RecommendationItem[]> {
  const radius = kind === 'food' ? 3200 : 5200;
  const query = kind === 'food'
    ? `[out:json][timeout:20];(node(around:${radius},${center.lat},${center.lng})[amenity~"restaurant|cafe|fast_food|bar|pub|food_court"];way(around:${radius},${center.lat},${center.lng})[amenity~"restaurant|cafe|fast_food|bar|pub|food_court"];relation(around:${radius},${center.lat},${center.lng})[amenity~"restaurant|cafe|fast_food|bar|pub|food_court"];);out center tags 80;`
    : `[out:json][timeout:20];(node(around:${radius},${center.lat},${center.lng})[tourism~"attraction|museum|gallery|viewpoint|artwork|zoo"];way(around:${radius},${center.lat},${center.lng})[tourism~"attraction|museum|gallery|viewpoint|artwork|zoo"];relation(around:${radius},${center.lat},${center.lng})[tourism~"attraction|museum|gallery|viewpoint|artwork|zoo"];node(around:${radius},${center.lat},${center.lng})[leisure="park"];way(around:${radius},${center.lat},${center.lng})[leisure="park"];node(around:${radius},${center.lat},${center.lng})[historic];way(around:${radius},${center.lat},${center.lng})[historic];node(around:${radius},${center.lat},${center.lng})[amenity~"place_of_worship|arts_centre"];way(around:${radius},${center.lat},${center.lng})[amenity~"place_of_worship|arts_centre"];);out center tags 120;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8', 'User-Agent': USER_AGENT },
    body: query,
  });
  if (!res.ok) return [];
  const jsonRes = await res.json() as any;
  const elements = Array.isArray(jsonRes?.elements) ? jsonRes.elements : [];
  return elements
    .map((el: any) => {
      const lat = typeof el.lat === 'number' ? el.lat : el.center?.lat;
      const lng = typeof el.lon === 'number' ? el.lon : el.center?.lon;
      const tags = el.tags || {};
      const title = tags.name || tags['name:ja'] || tags['official_name'];
      if (!title || typeof lat !== 'number' || typeof lng !== 'number') return null;
      const addressParts = [tags['addr:city'], tags['addr:suburb'], tags['addr:street']].filter(Boolean);
      return {
        id: `osm:${el.type}:${el.id}`,
        title,
        description: buildRecommendationDescription(title, addressParts.join(' '), kind, distanceKm(center.lat, center.lng, lat, lng)),
        address: addressParts.join(' ') || undefined,
        lat,
        lng,
        source: 'places' as const,
      };
    })
    .filter(Boolean) as RecommendationItem[];
}

function buildRecommendationDescription(title: string, address: string | undefined, kind: 'sightseeing' | 'food', distanceKmValue: number) {
  if (kind === 'food') {
    return `${title}は${address || 'このエリア'}で立ち寄りやすい飲食候補です。中心地点から約${distanceKmValue.toFixed(1)}km圏で、食事や休憩の候補として使いやすいです。`;
  }
  return `${title}は${address || 'このエリア'}で立ち寄りやすい観光候補です。中心地点から約${distanceKmValue.toFixed(1)}km圏で、移動計画に組み込みやすいです。`;
}

function dedupeRecommendationItems(items: RecommendationItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalizeForKey(`${item.title}|${item.address || ''}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function buildTrends(body: RequestBody): Promise<TrendItem[]> {
  const location = [body.cityArea, body.state, body.country].filter(Boolean).join(' ');
  const suggestions = await getGoogleSuggestQueries(location);
  const unique = dedupeStrings(suggestions)
    .filter((q) => includesLocation(q, body))
    .filter((q) => isUsefulTrendQuery(q, body))
    .slice(0, 10);
  return unique.map((keyword, index) => ({
    id: `trend:${index + 1}`,
    keyword,
    reason: explainTrendKeyword(keyword, body),
    sourceUrl: `https://www.google.com/search?q=${encodeURIComponent(keyword)}`,
  }));
}

async function getGoogleSuggestQueries(location: string): Promise<string[]> {
  const variants = [
    location,
    `${location} `,
    location.replace(/\s+/g, ' '),
  ].filter(Boolean);
  const results: string[] = [];
  for (const q of variants) {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=ja&q=${encodeURIComponent(q)}`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (!res.ok) continue;
      const payload = await res.json() as SuggestResponse;
      const suggestions = Array.isArray(payload?.[1]) ? payload[1] : [];
      results.push(...suggestions);
    } catch {
      // ignore single-source failures
    }
  }
  return results;
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizeForKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function includesLocation(query: string, body: RequestBody) {
  const q = normalizeForKey(query);
  return [body.cityArea, body.state, body.landmark || '']
    .filter(Boolean)
    .some((part) => q.includes(normalizeForKey(part)));
}

function isUsefulTrendQuery(query: string, body: RequestBody) {
  const q = query.trim();
  if (q.length < 4) return false;
  if (/^[\W_]+$/.test(q)) return false;
  if (/�/.test(q)) return false;
  if (/^[0-9\-\s]+$/.test(q)) return false;
  const stripped = normalizeForKey(q)
    .replace(normalizeForKey(body.cityArea), '')
    .replace(normalizeForKey(body.state), '')
    .replace(normalizeForKey(body.country), '')
    .trim();
  return stripped.length >= 2;
}

function explainTrendKeyword(keyword: string, body: RequestBody) {
  const loc = `${body.state}${body.cityArea}`;
  const k = keyword.toLowerCase();
  if (/ランチ|lunch|ディナー|居酒屋|グルメ|食べ歩き/.test(keyword)) {
    return `${loc}では食事先を当日比較したい検索が増えやすく、営業時間・混雑・価格帯・予約可否を確認する目的でこの語が伸びています。`;
  }
  if (/カフェ|cafe|喫茶/.test(keyword)) {
    return `${loc}では休憩・待ち合わせ・作業場所の需要が重なり、入りやすい店や雰囲気の良い店を探す検索としてこの語が人気になりやすいです。`;
  }
  if (/ホテル|宿|旅館/.test(keyword)) {
    return `${loc}へ来訪する人が宿泊先を直前比較する時に検索しやすい語で、立地・価格・アクセス条件を確認する需要が背景にあります。`;
  }
  if (/天気|雨|気温/.test(keyword)) {
    return `${loc}での外出計画や服装判断のために天候確認の検索が増えており、その場で予定を組み替えたい人の需要が背景です。`;
  }
  if (/アクセス|行き方|駅|駐車場/.test(keyword)) {
    return `${loc}までの移動手段や現地での移動導線を確認したい時に検索されやすい語で、初訪問や混雑回避の需要が背景にあります。`;
  }
  if (/イベント|ライブ|祭り|展示|フェス/.test(keyword)) {
    return `${loc}で開催中・開催予定の催しを確認する検索として伸びやすく、日程・会場・チケット・混雑を知りたい需要が背景にあります。`;
  }
  if (/桜|紅葉|花見|イルミネーション|夜景/.test(keyword)) {
    return `${loc}の季節需要が高まる時期に、見頃や写真映え、混雑具合を確認したい人が増えるためこの語が検索されやすくなります。`;
  }
  if (/観光|見どころ|おすすめ|デート/.test(keyword)) {
    return `${loc}をこれから回る人が、どこへ行くか・何を優先するかを決める段階で検索しやすい語で、回遊計画の需要が背景にあります。`;
  }
  return `${loc}でこのワードが検索されている背景には、現地で何が起きているか・何を優先して見るべきかを短時間で把握したい需要があると考えられます。`;
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
