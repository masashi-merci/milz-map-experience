
import { createClient } from '@supabase/supabase-js';
import { json } from '../../_shared/response';

type RequestBody = {
  mode: 'recommendation' | 'trend';
  regionKey: string;
  country: string;
  state: string;
  cityArea: string;
  landmark?: string;
};

type GeocodeResult = { lat: number; lng: number; displayName: string };
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

type TrendItem = { id: string; keyword: string; reason: string; sourceUrl?: string };

const RECOMMEND_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const TREND_TTL_MS = 24 * 60 * 60 * 1000;
const USER_AGENT = 'Milz Map Experience/2.0';

const supabaseUrl = (globalThis as any).process?.env?.SUPABASE_URL || (globalThis as any).SUPABASE_URL;
const supabaseServiceRoleKey = (globalThis as any).process?.env?.SUPABASE_SERVICE_ROLE_KEY || (globalThis as any).SUPABASE_SERVICE_ROLE_KEY;
const geminiApiKey = (globalThis as any).process?.env?.GEMINI_API_KEY || (globalThis as any).GEMINI_API_KEY;
const supabase = supabaseUrl && supabaseServiceRoleKey ? createClient(supabaseUrl, supabaseServiceRoleKey) : null;

export const onRequestPost: PagesFunction = async ({ request }) => {
  try {
    const body = (await request.json()) as RequestBody;
    if (!body.country || !body.state || !body.cityArea) return json({ error: 'country / state / cityArea は必須です。' }, 400);

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
    return json({ error: error instanceof Error ? error.message : 'AI query failed.' }, 500);
  }
};

function buildRegionKey(body: RequestBody) {
  return [body.country, body.state, body.cityArea, body.landmark || ''].map(normalizeForKey).join('|');
}

async function readCache(cacheType: 'recommendation' | 'trend', regionKey: string) {
  if (!supabase) return null;
  const { data } = await supabase.from('ai_cache').select('payload_json,expires_at').eq('cache_type', cacheType).eq('region_key', regionKey).maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) return null;
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
  return { sightseeing: sightseeing.slice(0, 5), food: food.slice(0, 5) };
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
  return dedupeRecommendationItems([...admin, ...osm])
    .map((item) => ({ ...item, distance: distanceKm(center.lat, center.lng, item.lat, item.lng) }))
    .filter((item) => item.distance <= maxDistanceKm(kind, body))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5)
    .map(({ distance, ...item }) => item);
}

function maxDistanceKm(kind: 'sightseeing' | 'food', body: RequestBody) {
  const wide = /(マンハッタン|ニューヨーク|ハワイ|ソウル|大阪市|京都市|東京|new york|manhattan|seoul|honolulu)/i.test(body.cityArea);
  if (kind === 'food') return wide ? 3.6 : 2.3;
  return wide ? 5.8 : 3.6;
}

async function getAdminSpots(body: RequestBody, _center: GeocodeResult, kind: 'sightseeing' | 'food'): Promise<RecommendationItem[]> {
  if (!supabase) return [];
  const categories = kind === 'food' ? ['food'] : ['sightseeing', 'other'];
  const { data } = await supabase
    .from('spots')
    .select('id,title,description,address,lat,lng,category,city,region,country')
    .in('category', categories)
    .eq('country', body.country)
    .eq('region', body.state)
    .ilike('city', `%${body.cityArea}%`)
    .limit(40);
  if (!data) return [];
  return data.map((row: any) => ({
    id: `spot:${row.id}`,
    title: row.title,
    description: row.description || buildRecommendationDescription(row.title, row.address || `${row.city}`, kind, 0.4),
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
  return elements.map((el: any) => {
    const lat = typeof el.lat === 'number' ? el.lat : el.center?.lat;
    const lng = typeof el.lon === 'number' ? el.lon : el.center?.lon;
    const tags = el.tags || {};
    const title = tags['name:ja'] || tags.name || tags['official_name'];
    if (!title || typeof lat !== 'number' || typeof lng !== 'number') return null;
    const addressParts = [tags['addr:city'], tags['addr:suburb'], tags['addr:street']].filter(Boolean);
    const address = addressParts.join(' ') || center.displayName;
    return {
      id: `osm:${el.type}:${el.id}`,
      title,
      description: buildRecommendationDescription(title, address, kind, distanceKm(center.lat, center.lng, lat, lng)),
      address,
      lat,
      lng,
      source: 'places' as const,
    };
  }).filter(Boolean) as RecommendationItem[];
}

function buildRecommendationDescription(title: string, address: string | undefined, kind: 'sightseeing' | 'food', distanceKmValue: number) {
  if (kind === 'food') {
    return `${title}は${address || 'このエリア'}で立ち寄りやすい飲食候補です。中心地点から約${distanceKmValue.toFixed(1)}km圏にあり、食事や休憩先として動線に組み込みやすいです。`;
  }
  return `${title}は${address || 'このエリア'}で立ち寄りやすい観光候補です。中心地点から約${distanceKmValue.toFixed(1)}km圏にあり、周辺散策と組み合わせやすいです。`;
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
  const suggestions = await getGoogleSuggestQueries(location, body);
  const unique = dedupeStrings(suggestions)
    .filter((q) => includesLocation(q, body))
    .filter((q) => isUsefulTrendQuery(q, body))
    .slice(0, 10);

  const enriched = await Promise.all(unique.map(async (keyword, index) => ({
    id: `trend:${index + 1}`,
    keyword,
    reason: await explainTrendKeyword(keyword, body),
    sourceUrl: `https://www.google.com/search?q=${encodeURIComponent(keyword)}`,
  })));

  return enriched;
}

async function getGoogleSuggestQueries(location: string, body: RequestBody): Promise<string[]> {
  const seeds = [
    location,
    `${location} ランチ`,
    `${location} カフェ`,
    `${location} 観光`,
    `${location} ホテル`,
    `${location} イベント`,
    `${location} アクセス`,
    `${location} 天気`,
    `${body.cityArea} グルメ`,
    `${body.cityArea} おすすめ`,
  ];
  const results: string[] = [];
  for (const q of seeds) {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=ja&q=${encodeURIComponent(q)}`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (!res.ok) continue;
      const payload = await res.json() as SuggestResponse;
      const suggestions = Array.isArray(payload?.[1]) ? payload[1] : [];
      results.push(...suggestions);
    } catch {}
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
  const normalized = normalizeForKey(query);
  return [body.cityArea, body.state].some((part) => normalized.includes(normalizeForKey(part)));
}

function isUsefulTrendQuery(query: string, body: RequestBody) {
  const normalized = normalizeForKey(query);
  if (!normalized) return false;
  if (/local trend|ローカルトレンド|google trends|ぐーぐるとれんず/.test(normalized)) return false;
  if (/^[\W_]+$/.test(query)) return false;
  if (normalized.length < normalizeForKey(body.cityArea).length + 2) return false;
  return true;
}

async function explainTrendKeyword(keyword: string, body: RequestBody) {
  const heuristic = heuristicTrendReason(keyword, body);
  if (!geminiApiKey) return heuristic;
  try {
    const prompt = `あなたは検索意図の編集者です。以下の検索ワードが、なぜ今その地域で検索されているかを日本語で1-2文、具体的に推測してください。テンプレを使わず、イベント・季節・飲食・アクセス・観光・比較検討などの背景を入れてください。
地域: ${body.cityArea} / ${body.state} / ${body.country}
検索ワード: ${keyword}`;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 120 } }),
    });
    if (!res.ok) return heuristic;
    const jsonRes = await res.json() as any;
    const text = jsonRes?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join(' ').trim();
    return text || heuristic;
  } catch {
    return heuristic;
  }
}

function heuristicTrendReason(keyword: string, body: RequestBody) {
  const area = body.cityArea;
  if (/ランチ|ディナー|グルメ|レストラン|居酒屋/.test(keyword)) return `${area}で食事先を比較したい検索が増えている語です。来店直前の店選びや、週末の外食先検討で検索されやすいです。`;
  if (/カフェ|喫茶/.test(keyword)) return `${area}で休憩や作業向けの店を探す流れで検索されやすい語です。写真映えや営業時間の確認も重なりやすいです。`;
  if (/ホテル|宿|旅館/.test(keyword)) return `${area}周辺で宿泊や滞在計画を立てる人が増えると伸びやすい語です。料金比較や立地確認の需要が重なります。`;
  if (/アクセス|行き方|駅|駐車場/.test(keyword)) return `${area}へ向かう直前の移動確認で検索されやすい語です。電車・徒歩・車の導線確認が背景にあります。`;
  if (/イベント|祭|フェス|展示|ライブ/.test(keyword)) return `${area}で期間限定の催しやイベントが意識される時に検索されやすい語です。開催日や会場情報を確認したい動きが背景にあります。`;
  if (/桜|紅葉|花火|天気/.test(keyword)) return `${area}で季節の見頃や外出条件を確認したい時に検索が伸びやすい語です。天候と回遊計画を合わせて調べる需要があります。`;
  return `${area}周辺で今よく調べられている語です。観光や飲食、移動計画の直前検索が重なって上がっている可能性があります。`;
}

function normalizeForKey(value: string) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(value: number) {
  return (value * Math.PI) / 180;
}
