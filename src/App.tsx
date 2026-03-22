import { useEffect, useMemo, useState } from 'react';
import { BottomNav } from './components/BottomNav';
import { MapPanel } from './components/MapPanel';
import { RecommendationList, TrendList } from './components/AISection';
import { REGIONS, getRegion } from './lib/regions';
import { isSupabaseReady, supabase } from './lib/supabase';
import type {
  AIRecommendationItem,
  AppTab,
  AuthState,
  FavoriteItem,
  MapFocusPin,
  RecommendationPayload,
  RegionArea,
  RegionKey,
  Spot,
  SpotDraft,
  TrendItem,
} from './types/app';

const EMPTY_RECOMMENDATION: RecommendationPayload = { sightseeing: [], food: [] };
const DEMO_TRENDS: TrendItem[] = [];

const blankDraft = (region = getRegion('tokyo'), area = region.areas[0]): SpotDraft => ({
  title: '',
  description: '',
  website: '',
  country: region.countryJa,
  region: region.stateJa,
  city: area.labelJa,
  address: '',
  lat: area.lat,
  lng: area.lng,
  category: 'sightseeing',
  imageFile: null,
});

export default function App() {
  const [tab, setTab] = useState<AppTab>('map');
  const [regionKey, setRegionKey] = useState<RegionKey>('tokyo');
  const [areaId, setAreaId] = useState<string>('shibuya');
  const [landmark, setLandmark] = useState('');
  const [focus, setFocus] = useState<MapFocusPin | null>(null);
  const [auth, setAuth] = useState<AuthState>({ role: 'admin', displayName: 'Masashi' });
  const [spots, setSpots] = useState<Spot[]>([]);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [recommendation, setRecommendation] = useState<RecommendationPayload>(EMPTY_RECOMMENDATION);
  const [trends, setTrends] = useState<TrendItem[]>(DEMO_TRENDS);
  const [loading, setLoading] = useState<'recommend' | 'trend' | null>(null);
  const [activeAiTab, setActiveAiTab] = useState<'recommend' | 'trend'>('recommend');
  const [error, setError] = useState('');
  const [showSpotModal, setShowSpotModal] = useState(false);
  const [draft, setDraft] = useState<SpotDraft>(blankDraft());

  const region = getRegion(regionKey);
  const selectedArea = region.areas.find((area) => area.id === areaId) ?? region.areas[0];
  const center = useMemo<[number, number]>(() => [selectedArea.lat, selectedArea.lng], [selectedArea]);

  useEffect(() => {
    setDraft(blankDraft(region, selectedArea));
  }, [regionKey, areaId]);

  useEffect(() => {
    void loadInitial();
  }, []);

  async function loadInitial() {
    if (!isSupabaseReady || !supabase) {
      setSpots([
        {
          id: 'demo-1',
          title: 'サンプルスポット',
          description: '新しい clean base のピン確認用サンプルです。',
          country: '日本',
          region: '東京都',
          city: '渋谷',
          lat: 35.6618,
          lng: 139.7041,
          category: 'sightseeing',
          createdAt: new Date().toISOString(),
        },
      ]);
      return;
    }
    const { data: authData } = await supabase.auth.getUser();
    if (authData.user) {
      const { data: profile } = await supabase.from('profiles').select('role,display_name').eq('id', authData.user.id).maybeSingle();
      setAuth({
        userId: authData.user.id,
        email: authData.user.email,
        role: (profile?.role as 'admin' | 'user') ?? 'user',
        displayName: profile?.display_name ?? authData.user.email,
      });
      const { data: spotRows } = await supabase.from('spots').select('*').order('created_at', { ascending: false }).limit(100);
      if (spotRows) {
        setSpots(
          spotRows.map((row: any) => ({
            id: row.id,
            title: row.title,
            description: row.description ?? '',
            website: row.website ?? undefined,
            imageUrl: row.image_url ?? undefined,
            country: row.country,
            region: row.region,
            city: row.city,
            address: row.address ?? undefined,
            lat: row.lat,
            lng: row.lng,
            category: row.category,
            createdAt: row.created_at,
          })),
        );
      }
      const { data: favoriteRows } = await supabase.from('favorites').select('*').eq('user_id', authData.user.id).order('created_at', { ascending: false });
      if (favoriteRows) {
        setFavorites(
          favoriteRows.map((row: any) => ({
            id: row.id,
            itemType: row.item_type,
            title: row.payload_json?.title ?? row.item_key,
            subtitle: row.payload_json?.subtitle,
            lat: row.payload_json?.lat,
            lng: row.payload_json?.lng,
            createdAt: row.created_at,
          })),
        );
      }
    }
  }

  const saveFavorite = async (payload: FavoriteItem) => {
    setFavorites((prev) => [payload, ...prev.filter((item) => item.id !== payload.id)]);
    if (!supabase || !auth.userId) return;
    await supabase.from('favorites').upsert({
      user_id: auth.userId,
      item_type: payload.itemType,
      item_key: payload.id,
      payload_json: {
        title: payload.title,
        subtitle: payload.subtitle,
        lat: payload.lat,
        lng: payload.lng,
      },
    }, { onConflict: 'user_id,item_type,item_key' });
  };

  const onMapPick = (lat: number, lng: number) => {
    if (auth.role !== 'admin') return;
    setDraft((prev) => ({ ...prev, lat, lng }));
    setShowSpotModal(true);
    setTab('map');
  };

  const submitSpot = async () => {
    const newSpot: Spot = {
      id: crypto.randomUUID(),
      title: draft.title,
      description: draft.description,
      website: draft.website || undefined,
      country: draft.country,
      region: draft.region,
      city: draft.city,
      address: draft.address || undefined,
      lat: draft.lat,
      lng: draft.lng,
      category: draft.category,
      createdAt: new Date().toISOString(),
    };
    setSpots((prev) => [newSpot, ...prev]);
    setShowSpotModal(false);

    if (!supabase || !auth.userId) return;
    let imageUrl: string | undefined;
    if (draft.imageFile) {
      const signed = await fetch('/api/uploads/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: draft.imageFile.name, contentType: draft.imageFile.type || 'image/jpeg' }),
      }).then((r) => r.json());
      if (signed?.uploadUrl) {
        await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'Content-Type': draft.imageFile.type || 'image/jpeg' }, body: draft.imageFile });
        imageUrl = signed.publicUrl;
      }
    }
    await supabase.from('spots').insert({
      title: draft.title,
      description: draft.description,
      website: draft.website || null,
      image_url: imageUrl ?? null,
      country: draft.country,
      region: draft.region,
      city: draft.city,
      address: draft.address || null,
      lat: draft.lat,
      lng: draft.lng,
      category: draft.category,
      created_by: auth.userId,
    });
  };

  const fetchRecommendation = async () => {
    setLoading('recommend');
    setActiveAiTab('recommend');
    setError('');
    try {
      const response = await fetch('/api/ai/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'recommendation',
          regionKey,
          country: region.countryJa,
          state: region.stateJa,
          cityArea: selectedArea.labelJa,
          landmark,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Recommendation 取得に失敗しました。');
      setRecommendation(json.data as RecommendationPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recommendation 取得に失敗しました。');
    } finally {
      setLoading(null);
    }
  };

  const fetchTrends = async () => {
    setLoading('trend');
    setActiveAiTab('trend');
    setError('');
    try {
      const response = await fetch('/api/ai/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'trend',
          regionKey,
          country: region.countryJa,
          state: region.stateJa,
          cityArea: selectedArea.labelJa,
          landmark,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Trend 取得に失敗しました。');
      setTrends(json.data as TrendItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Trend 取得に失敗しました。');
    } finally {
      setLoading(null);
    }
  };

  const handleViewMap = (item: AIRecommendationItem) => {
    setFocus({ title: item.title, description: item.description, lat: item.lat, lng: item.lng });
    setTab('map');
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">milz</div>
        <div className="role-badge">{auth.role === 'admin' ? 'ADMIN' : 'USER'}</div>
      </header>

      <main className="main-grid">
        <section className="hero-card">
          <p className="eyebrow">MAP × EXPERIENCE</p>
          <h1>新しい repo に合わせて、Map / Spot / Favorite / AI を clean に再構築します。</h1>
          <p>Supabase は既存 project を使い、画像は Cloudflare R2 に保存します。</p>
        </section>

        <section className="filters-card">
          <div className="filters-card__title">地域選択</div>
          <div className="segmented">
            {REGIONS.map((candidate) => (
              <button key={candidate.key} className={candidate.key === regionKey ? 'segmented__item is-active' : 'segmented__item'} onClick={() => { setRegionKey(candidate.key); setAreaId(candidate.areas[0].id); setFocus(null); }}>
                {candidate.label}
              </button>
            ))}
          </div>
          <div className="filter-grid">
            <label><span>国</span><input value={region.countryJa} readOnly /></label>
            <label><span>都道府県 / 州</span><input value={region.stateJa} readOnly /></label>
            <label>
              <span>市区町村 / エリア</span>
              <select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
                {region.areas.map((area: RegionArea) => <option key={area.id} value={area.id}>{area.labelJa}</option>)}
              </select>
            </label>
            <label><span>住所 / ランドマーク</span><input value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="任意" /></label>
          </div>
        </section>

        {tab === 'map' && (
          <>
            <MapPanel center={center} spots={spots} focus={focus} authRole={auth.role} onFavorite={(spot) => saveFavorite({ id: `spot:${spot.id}`, itemType: 'spot', title: spot.title, subtitle: spot.city, lat: spot.lat, lng: spot.lng, createdAt: new Date().toISOString() })} onMapPick={onMapPick} />
            {auth.role === 'admin' ? <button className="floating-add" onClick={() => setShowSpotModal(true)}>＋ Spotを登録</button> : null}
          </>
        )}

        {tab === 'ai' && (
          <section className="panel ai-panel">
            <div className="segmented segmented--wide">
              <button className={activeAiTab === 'recommend' ? 'segmented__item is-active' : 'segmented__item'} onClick={() => setActiveAiTab('recommend')}>RECOMMENDATION</button>
              <button className={activeAiTab === 'trend' ? 'segmented__item is-active' : 'segmented__item'} onClick={() => setActiveAiTab('trend')}>TREND</button>
            </div>
            <div className="action-row">
              <button className="primary-button" onClick={fetchRecommendation} disabled={loading === 'recommend'}>{loading === 'recommend' ? 'Recommendation 取得中...' : 'Recommendation を取得'}</button>
              <button className="secondary-button" onClick={fetchTrends} disabled={loading === 'trend'}>{loading === 'trend' ? 'Trend 取得中...' : 'Trend を取得'}</button>
            </div>
            {error ? <div className="error-box">{error}</div> : null}
            {activeAiTab === 'recommend' ? (
              <RecommendationList data={recommendation} onViewMap={handleViewMap} onSave={(item) => saveFavorite({ id: `recommendation:${item.id}`, itemType: 'recommendation', title: item.title, subtitle: item.address, lat: item.lat, lng: item.lng, createdAt: new Date().toISOString() })} />
            ) : (
              <TrendList items={trends} onSave={(item) => saveFavorite({ id: `trend:${item.id}`, itemType: 'trend', title: item.keyword, subtitle: item.reason, createdAt: new Date().toISOString() })} />
            )}
          </section>
        )}

        {tab === 'favorite' && (
          <section className="panel">
            <h2>Favorite</h2>
            {!favorites.length ? <div className="empty-box">まだお気に入りはありません。</div> : null}
            <div className="card-grid">
              {favorites.map((item) => (
                <article key={item.id} className="ai-card">
                  <div className="ai-card__eyebrow">{item.itemType}</div>
                  <h4>{item.title}</h4>
                  {item.subtitle ? <p>{item.subtitle}</p> : null}
                  {(item.lat && item.lng) ? <div className="ai-card__actions"><button onClick={() => { setFocus({ title: item.title, description: item.subtitle, lat: item.lat!, lng: item.lng! }); setTab('map'); }}>View on Map</button></div> : null}
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === 'profile' && (
          <section className="panel profile-panel">
            <h2>Profile</h2>
            <div className="profile-stats">
              <div><span>Role</span><strong>{auth.role.toUpperCase()}</strong></div>
              <div><span>Spots</span><strong>{spots.length}</strong></div>
              <div><span>Favorites</span><strong>{favorites.length}</strong></div>
            </div>
          </section>
        )}
      </main>

      {showSpotModal ? (
        <div className="modal-backdrop" onClick={() => setShowSpotModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Spotを登録</h3>
            <div className="form-grid">
              <label><span>タイトル</span><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
              <label><span>カテゴリ</span><select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as SpotDraft['category'] })}><option value="sightseeing">観光地</option><option value="food">飲食店</option><option value="other">その他</option></select></label>
              <label className="form-grid__full"><span>説明</span><textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
              <label><span>Website</span><input value={draft.website} onChange={(e) => setDraft({ ...draft, website: e.target.value })} /></label>
              <label><span>画像</span><input type="file" accept="image/*" onChange={(e) => setDraft({ ...draft, imageFile: e.target.files?.[0] ?? null })} /></label>
              <label><span>住所</span><input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></label>
              <label><span>緯度</span><input type="number" value={draft.lat} onChange={(e) => setDraft({ ...draft, lat: Number(e.target.value) })} /></label>
              <label><span>経度</span><input type="number" value={draft.lng} onChange={(e) => setDraft({ ...draft, lng: Number(e.target.value) })} /></label>
            </div>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setShowSpotModal(false)}>Cancel</button>
              <button className="primary-button" onClick={submitSpot}>Save Spot</button>
            </div>
          </div>
        </div>
      ) : null}

      <BottomNav value={tab} onChange={setTab} />
    </div>
  );
}
