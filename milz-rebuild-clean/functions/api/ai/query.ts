import { createClient } from '@supabase/supabase-js';
import { json } from '../../_shared/response';

type RequestBody = {
  mode: 'recommendation' | 'trend';
  country: string;
  state: string;
  cityArea: string;
  landmark?: string;
  lang?: 'ja' | 'en';
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
  score?: number;
  distanceKm?: number;
  rawType?: string;
};

type TrendItem = { id: string; keyword: string; reason: string; sourceUrl?: string };

type CacheType = 'recommendation' | 'trend';

const RECOMMEND_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const TREND_TTL_MS = 24 * 60 * 60 * 1000;
const USER_AGENT = 'Milz Map Experience/3.0';

const supabaseUrl = (globalThis as any).process?.env?.SUPABASE_URL || (globalThis as any).SUPABASE_URL;
const supabaseServiceRoleKey = (globalThis as any).process?.env?.SUPABASE_SERVICE_ROLE_KEY || (globalThis as any).SUPABASE_SERVICE_ROLE_KEY;
const geminiApiKey = (globalThis as any).process?.env?.GEMINI_API_KEY || (globalThis as any).GEMINI_API_KEY;
const supabase = supabaseUrl && supabaseServiceRoleKey ? createClient(supabaseUrl, supabaseServiceRoleKey) : null;

const CHAIN_BLACKLIST = [
  /mcdonald/i, /macdonald/i, /マクドナルド/, /starbucks/i, /スターバックス/, /burger king/i, /ケンタッキー/,
  /kfc/i, /subway/i, /ドトール/, /tully'?s/i, /タリーズ/, /サイゼリヤ/, /くら寿司/, /はま寿司/, /すき家/,
  /吉野家/, /松屋/, /coco壱/i, /coco ichibanya/i, /丸亀製麺/, /なか卯/, /mos burger/i, /モスバーガー/,
  /saizeriya/i, /pronto/i, /コメダ/, /komeda/i, /blue bottle/i, /shake shack/i,
];

const SIGHTSEEING_BLOCKLIST = [
  /church/i, /chapel/i, /cathedral/i, /mosque/i, /synagogue/i, /temple/i, /shrine/i, /religious/i,
  /教会/, /協会/, /寺/, /神社/, /礼拝堂/, /宗教/, /モスク/, /大聖堂/, /カテドラル/,
  /association/i, /society/i, /federation/i, /committee/i, /office/i, /bureau/i, /ministry/i,
  /clinic/i, /hospital/i, /school/i, /college/i, /university/i, /embassy/i,
  /病院/, /学校/, /大学/, /事務所/, /役所/, /庁舎/, /会館/, /センター$/,
];

export const onRequestPost: PagesFunction = async ({ request }) => {
  try {
    const body = (await request.json()) as RequestBody;
    if (!body.country || !body.state || !body.cityArea) return json({ error: 'country / state / cityArea は必須です。' }, 400);

    const regionKey = buildRegionKey(body);
    const cacheType: CacheType = body.mode === 'recommendation' ? 'recommendation' : 'trend';
    const cached = await readCache(cacheType, regionKey);
    if (cached) return json({ data: cached });

    if (body.mode === 'recommendation') {
      const data = await buildRecommendations(body);
      await writeCache('recommendation', regionKey, data, RECOMMEND_TTL_MS);
      return json({ data });
    }

    const data = await buildTrends(body);
    await writeCache('trend', regionKey, data, TREND_TTL_MS);
    return json({ data });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'AI query failed.' }, 500);
  }
};

function buildRegionKey(body: RequestBody) {
  return [body.lang || 'ja', body.country, body.state, body.cityArea, body.landmark || ''].map(normalizeKey).join('|');
}

async function readCache(cacheType: CacheType, regionKey: string) {
  if (!supabase) return null;
  const { data } = await supabase.from('ai_cache').select('payload_json,expires_at').eq('cache_type', cacheType).eq('region_key', regionKey).maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) return null;
  return data.payload_json;
}

async function writeCache(cacheType: CacheType, regionKey: string, payload: unknown, ttlMs: number) {
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
  const admin = await getAdminSpots(geocode, body);
  const sightseeingRaw = await getOsmPlaces(geocode, body, 'sightseeing');
  const foodRaw = await getOsmPlaces(geocode, body, 'food');

  const sightseeing = rankRecommendations([...admin.sightseeing, ...sightseeingRaw], geocode, body, 'sightseeing').slice(0, 5);
  const food = rankRecommendations([...admin.food, ...foodRaw], geocode, body, 'food').slice(0, 5);

  return {
    sightseeing: await enrichRecommendationDescriptions(sightseeing, body, 'sightseeing'),
    food: await enrichRecommendationDescriptions(food, body, 'food'),
  };
}

async function geocodeLocation(body: RequestBody): Promise<GeocodeResult> {
  const q = [body.landmark, body.cityArea, body.state, body.country].filter(Boolean).join(' ');
  const lang = body.lang === 'en' ? 'en' : 'ja';
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&accept-language=${lang}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error('Geocode failed');
  const rows = await res.json() as any[];
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(body.lang === 'en' ? 'Unable to locate that area.' : '指定地域を geocode できませんでした。');
  const row = rows[0];
  return { lat: Number(row.lat), lng: Number(row.lon), displayName: row.display_name || q };
}

async function getAdminSpots(center: GeocodeResult, body: RequestBody) {
  if (!supabase) return { sightseeing: [] as RecommendationItem[], food: [] as RecommendationItem[] };
  const { data } = await supabase
    .from('spots')
    .select('id,title,description,address,lat,lng,category,city,region,country')
    .limit(300);
  if (!data) return { sightseeing: [], food: [] };
  const mapped = data.map((row: any) => ({
    id: `spot:${row.id}`,
    title: row.title,
    description: row.description || '',
    address: row.address || [row.city, row.region].filter(Boolean).join(', '),
    lat: Number(row.lat),
    lng: Number(row.lng),
    source: 'spot' as const,
    rawType: row.category,
    distanceKm: distanceKm(center.lat, center.lng, Number(row.lat), Number(row.lng)),
  }));
  return {
    sightseeing: mapped.filter((item) => (item.rawType === 'sightseeing' || item.rawType === 'other') && passesSightseeingFilter(item.title, item.address || '')),
    food: mapped.filter((item) => item.rawType === 'food' && passesFoodFilter(item.title, item.address || '')),
  };
}

async function getOsmPlaces(center: GeocodeResult, body: RequestBody, kind: 'sightseeing' | 'food'): Promise<RecommendationItem[]> {
  const radius = kind === 'food' ? 4500 : 8000;
  const query = kind === 'food'
    ? `[out:json][timeout:20];(
        node(around:${radius},${center.lat},${center.lng})[amenity~"restaurant|cafe|ice_cream|biergarten|food_court"];
        way(around:${radius},${center.lat},${center.lng})[amenity~"restaurant|cafe|ice_cream|biergarten|food_court"];
        relation(around:${radius},${center.lat},${center.lng})[amenity~"restaurant|cafe|ice_cream|biergarten|food_court"];
      );out center tags 120;`
    : `[out:json][timeout:20];(
        node(around:${radius},${center.lat},${center.lng})[tourism~"attraction|museum|gallery|viewpoint|theme_park|zoo|aquarium|artwork"];
        way(around:${radius},${center.lat},${center.lng})[tourism~"attraction|museum|gallery|viewpoint|theme_park|zoo|aquarium|artwork"];
        relation(around:${radius},${center.lat},${center.lng})[tourism~"attraction|museum|gallery|viewpoint|theme_park|zoo|aquarium|artwork"];
        node(around:${radius},${center.lat},${center.lng})[leisure~"park|garden|nature_reserve"];
        way(around:${radius},${center.lat},${center.lng})[leisure~"park|garden|nature_reserve"];
        relation(around:${radius},${center.lat},${center.lng})[leisure~"park|garden|nature_reserve"];
        node(around:${radius},${center.lat},${center.lng})[historic~"monument|castle|ruins|memorial|fort|archaeological_site"];
        way(around:${radius},${center.lat},${center.lng})[historic~"monument|castle|ruins|memorial|fort|archaeological_site"];
        relation(around:${radius},${center.lat},${center.lng})[historic~"monument|castle|ruins|memorial|fort|archaeological_site"];
      );out center tags 160;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8', 'User-Agent': USER_AGENT },
    body: query,
  });
  if (!res.ok) return [];
  const jsonRes = await res.json() as any;
  const elements = Array.isArray(jsonRes?.elements) ? jsonRes.elements : [];
  const items: RecommendationItem[] = [];
  for (const el of elements) {
    const lat = typeof el.lat === 'number' ? el.lat : el.center?.lat;
    const lng = typeof el.lon === 'number' ? el.lon : el.center?.lon;
    const tags = el.tags || {};
    const title = tags['name:ja'] || tags['name:en'] || tags.name || tags['official_name'];
    if (!title || typeof lat !== 'number' || typeof lng !== 'number') continue;
    const address = [tags['addr:city'], tags['addr:suburb'], tags['addr:street']].filter(Boolean).join(' ') || body.cityArea;
    const item: RecommendationItem = {
      id: `osm:${el.type}:${el.id}`,
      title,
      description: '',
      address,
      lat,
      lng,
      source: 'places',
      rawType: tags.tourism || tags.amenity || tags.leisure || tags.historic || '',
      distanceKm: distanceKm(center.lat, center.lng, lat, lng),
    };
    if (kind === 'food' ? passesFoodFilter(title, address) : passesSightseeingFilter(title, address, tags)) {
      items.push(item);
    }
  }
  return items;
}

function passesSightseeingFilter(title: string, address: string, tags: Record<string, string> = {}) {
  const hay = `${title} ${address} ${Object.values(tags).join(' ')}`;
  if (SIGHTSEEING_BLOCKLIST.some((pattern) => pattern.test(hay))) return false;
  if (/place_of_worship|religion|church|shrine|temple|mosque|synagogue/i.test(JSON.stringify(tags))) return false;
  return title.trim().length >= 2;
}

function passesFoodFilter(title: string, address: string) {
  const hay = `${title} ${address}`;
  if (CHAIN_BLACKLIST.some((pattern) => pattern.test(hay))) return false;
  if (/school|hospital|office|church|temple|shrine|協会|教会|寺|神社/.test(hay)) return false;
  return title.trim().length >= 2;
}

function rankRecommendations(items: RecommendationItem[], center: GeocodeResult, body: RequestBody, kind: 'sightseeing' | 'food') {
  const areaTokens = [body.cityArea, body.state, body.landmark || ''].filter(Boolean).map(normalizeKey);
  return dedupeRecommendationItems(items)
    .map((item) => {
      const distance = item.distanceKm ?? distanceKm(center.lat, center.lng, item.lat, item.lng);
      const text = normalizeKey(`${item.title} ${item.address || ''}`);
      let score = item.source === 'spot' ? 100 : 0;
      score += Math.max(0, 40 - distance * (kind === 'food' ? 12 : 8));
      if (item.rawType) {
        if (kind === 'sightseeing' && /museum|gallery|viewpoint|attraction|monument|castle|park|garden|theme_park|zoo|aquarium|ruins/.test(item.rawType)) score += 12;
        if (kind === 'food' && /restaurant|cafe|ice_cream|biergarten/.test(item.rawType)) score += 10;
      }
      if (areaTokens.some((token) => token && text.includes(token))) score += 20;
      if (item.title.length > 2 && item.title.length < 35) score += 4;
      return { ...item, distanceKm: distance, score };
    })
    .filter((item) => item.distanceKm! <= (kind === 'food' ? 4.5 : 8))
    .sort((a, b) => (b.score! - a.score!) || (a.distanceKm! - b.distanceKm!));
}

function dedupeRecommendationItems(items: RecommendationItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalizeKey(`${item.title}|${Math.round(item.lat * 1000)}|${Math.round(item.lng * 1000)}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function enrichRecommendationDescriptions(items: RecommendationItem[], body: RequestBody, kind: 'sightseeing' | 'food') {
  if (!items.length) return [];
  const fallback = items.map((item) => ({
    ...item,
    description: heuristicRecommendationDescription(item, body, kind),
  }));
  if (!geminiApiKey) return fallback;
  try {
    const outputLang = body.lang === 'en' ? 'English' : 'Japanese';
    const prompt = `You are a concise travel editor. Write one short ${outputLang} sentence for each place below.
Rules:
- Mention why the place is notable in ${body.cityArea}.
- Do not use vague template phrases.
- For sightseeing, focus on landmark/value/experience.
- For food, focus on local appeal, not generic chain language.
- Return JSON only: [{"id":"...","description":"..."}]
Location: ${body.cityArea}, ${body.state}, ${body.country}
Type: ${kind}
Places:
${items.map((item) => `- ${item.id} | ${item.title} | ${item.address || ''}`).join('\n')}`;
    const text = await callGemini(prompt, 512);
    const parsed = parseJsonArray(text);
    if (!parsed.length) return fallback;
    const map = new Map(parsed.map((row: any) => [String(row.id), String(row.description || '').trim()]));
    return items.map((item) => ({ ...item, description: map.get(item.id) || heuristicRecommendationDescription(item, body, kind) }));
  } catch {
    return fallback;
  }
}

function heuristicRecommendationDescription(item: RecommendationItem, body: RequestBody, kind: 'sightseeing' | 'food') {
  if (body.lang === 'en') {
    return kind === 'food'
      ? `${item.title} is a strong local dining option around ${body.cityArea}, easy to pair with walking and nearby stops.`
      : `${item.title} is a notable stop around ${body.cityArea}, easy to include in a focused local route.`;
  }
  return kind === 'food'
    ? `${item.title}は${body.cityArea}周辺で選びやすい飲食候補です。地域らしい食事動線に組み込みやすいです。`
    : `${item.title}は${body.cityArea}周辺で知名度があり、散策導線に入れやすい観光候補です。`;
}

async function buildTrends(body: RequestBody): Promise<TrendItem[]> {
  const suggestions = await getLocationSuggestQueries(body);
  const unique = dedupeStrings(suggestions)
    .filter((q) => includesLocation(q, body))
    .filter((q) => isUsefulTrendQuery(q, body))
    .slice(0, 10);

  if (!unique.length) {
    throw new Error(body.lang === 'en' ? 'Trend data could not be retrieved for this area right now.' : 'この地域の Trend を取得できませんでした。');
  }

  const reasons = await enrichTrendReasons(unique, body);
  return unique.map((keyword, index) => ({
    id: `trend:${index + 1}`,
    keyword,
    reason: reasons.get(keyword) || heuristicTrendReason(keyword, body),
    sourceUrl: `https://www.google.com/search?q=${encodeURIComponent(keyword)}`,
  }));
}

async function getLocationSuggestQueries(body: RequestBody): Promise<string[]> {
  const location = [body.landmark, body.cityArea].filter(Boolean).join(' ').trim() || [body.cityArea, body.state].filter(Boolean).join(' ');
  const seeds = body.lang === 'en'
    ? [
        location,
        `${location} best restaurants`,
        `${location} cafes`,
        `${location} things to do`,
        `${location} events`,
        `${location} hotel`,
        `${location} weather`,
        `${location} access`,
      ]
    : [
        location,
        `${location} ランチ`,
        `${location} カフェ`,
        `${location} 観光`,
        `${location} イベント`,
        `${location} ホテル`,
        `${location} 天気`,
        `${location} 行き方`,
        `${location} 駐車場`,
      ];
  const results: string[] = [];
  for (const q of seeds) {
    results.push(...(await fetchGoogleSuggest(q, body.lang || 'ja')));
  }
  return results;
}

async function fetchGoogleSuggest(query: string, lang: 'ja' | 'en') {
  const endpoints = [
    `https://suggestqueries.google.com/complete/search?client=chrome&hl=${lang}&q=${encodeURIComponent(query)}`,
    `https://suggestqueries.google.com/complete/search?client=firefox&hl=${lang}&q=${encodeURIComponent(query)}`,
  ];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (!res.ok) continue;
      const payload = await res.json() as SuggestResponse | any;
      const list = Array.isArray((payload as any)?.[1]) ? (payload as any)[1] : [];
      if (list.length) return list.map((v: unknown) => String(v));
    } catch {
      // continue
    }
  }
  return [];
}

async function enrichTrendReasons(keywords: string[], body: RequestBody) {
  const fallback = new Map(keywords.map((keyword) => [keyword, heuristicTrendReason(keyword, body)]));
  if (!geminiApiKey) return fallback;
  try {
    const outputLang = body.lang === 'en' ? 'English' : 'Japanese';
    const prompt = `You explain search intent. For each keyword below, write one short ${outputLang} sentence that explains why people are searching it now in ${body.cityArea}, ${body.state}. Mention specific context like seasonal demand, dining search, access checks, events, hotel comparison, weather, or sightseeing plans. Return JSON only: [{"keyword":"...","reason":"..."}]\nKeywords:\n${keywords.map((k) => `- ${k}`).join('\n')}`;
    const text = await callGemini(prompt, 700);
    const parsed = parseJsonArray(text);
    if (!parsed.length) return fallback;
    const map = new Map<string, string>();
    for (const row of parsed) {
      const keyword = String((row as any).keyword || '');
      const reason = String((row as any).reason || '').trim();
      if (keyword && reason) map.set(keyword, reason);
    }
    return new Map(keywords.map((keyword) => [keyword, map.get(keyword) || fallback.get(keyword)!]));
  } catch {
    return fallback;
  }
}

async function callGemini(prompt: string, maxOutputTokens: number) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.35, maxOutputTokens },
    }),
  });
  if (!res.ok) throw new Error('Gemini failed');
  const jsonRes = await res.json() as any;
  return jsonRes?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join(' ').trim() || '';
}

function parseJsonArray(text: string) {
  if (!text) return [];
  const cleaned = text.replace(/```json|```/g, '').trim();
  const match = cleaned.match(/\[[\s\S]*\]/);
  const candidate = match ? match[0] : cleaned;
  try {
    const parsed = JSON.parse(candidate);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function heuristicTrendReason(keyword: string, body: RequestBody) {
  const area = body.cityArea;
  const lang = body.lang || 'ja';
  if (/ランチ|ディナー|グルメ|レストラン|居酒屋|cafe|restaurant|food|breakfast|brunch/i.test(keyword)) {
    return lang === 'en'
      ? `This query is rising because people around ${area} are comparing where to eat right before going out.`
      : `${area}周辺で食事先を比較したい検索が増えている語です。来店直前の店選びや週末の外食検討が背景にあります。`;
  }
  if (/カフェ|喫茶|coffee|dessert/i.test(keyword)) {
    return lang === 'en'
      ? `People are likely searching this to find coffee, work-friendly cafés, or photogenic stops around ${area}.`
      : `${area}周辺で休憩や作業、写真映えの店を探す流れで検索されやすい語です。`;
  }
  if (/ホテル|宿|旅館|hotel/i.test(keyword)) {
    return lang === 'en'
      ? `This tends to rise when people compare places to stay near ${area} and check pricing or location.`
      : `${area}周辺で宿泊や滞在計画を立てる人が、立地や価格を比較する流れで検索しやすい語です。`;
  }
  if (/アクセス|行き方|駅|駐車場|access|station|parking|how to get/i.test(keyword)) {
    return lang === 'en'
      ? `This is usually searched right before a visit, when people need transport, station, or parking details for ${area}.`
      : `${area}へ向かう直前に、交通・駅・駐車場などを確認する検索が重なりやすい語です。`;
  }
  if (/イベント|祭|フェス|展示|ライブ|event|festival|exhibition/i.test(keyword)) {
    return lang === 'en'
      ? `Interest rises when there is a limited-time event, exhibition, or seasonal program drawing people to ${area}.`
      : `${area}で期間限定イベントや展示、催しが意識される時に検索が伸びやすい語です。`;
  }
  if (/天気|桜|紅葉|weather|cherry blossom|autumn/i.test(keyword)) {
    return lang === 'en'
      ? `People are likely checking timing, weather, and best conditions before going out around ${area}.`
      : `${area}で外出条件や見頃のタイミングを確認したい時に検索が伸びやすい語です。`;
  }
  return lang === 'en'
    ? `This appears to be a practical search around ${area}, likely tied to planning where to go, what to book, or what to compare right now.`
    : `${area}周辺で、行き先や比較対象を具体的に決める直前検索として伸びている可能性がある語です。`;
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizeKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function includesLocation(query: string, body: RequestBody) {
  const normalized = normalizeKey(query);
  const tokens = [body.cityArea, body.landmark || ''].filter(Boolean).map(normalizeKey);
  return tokens.some((token) => token && normalized.includes(token));
}

function isUsefulTrendQuery(query: string, body: RequestBody) {
  const normalized = normalizeKey(query);
  if (!normalized) return false;
  if (/local trend|ローカルトレンド|google trends|ぐーぐるとれんず/.test(normalized)) return false;
  if (/^[\W_]+$/.test(query)) return false;
  if (normalized === normalizeKey(body.cityArea) || normalized === normalizeKey(`${body.cityArea} ${body.landmark || ''}`)) return false;
  if (normalized.length < Math.max(4, normalizeKey(body.cityArea).length + 2)) return false;
  return true;
}

function normalizeKey(value: string) {
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
