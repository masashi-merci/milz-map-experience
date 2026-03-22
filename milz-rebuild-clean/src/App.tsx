import { useMemo, useState } from 'react';
import { BottomNav } from './components/BottomNav';
import { MapPanel } from './components/MapPanel';
import { RecommendationList, TrendList } from './components/AISection';
import { REGIONS, getRegion } from './lib/regions';
import type { AIRecommendationItem, AppTab, MapFocusPin, RecommendationPayload, RegionArea, RegionKey, Spot, TrendItem, UserRole } from './types/app';

const DEMO_SPOTS: Spot[] = [
  {
    id: 'spot-1',
    title: 'サンプルスポット',
    description: '新規アプリのピン表示確認用サンプルです。',
    country: '日本',
    state: '東京都',
    city: '渋谷',
    lat: 35.6618,
    lng: 139.7041,
    category: 'landmark',
    createdAt: new Date().toISOString(),
  },
];

export default function App() {
  const [tab, setTab] = useState<AppTab>('map');
  const [role] = useState<UserRole>('admin');
  const [regionKey, setRegionKey] = useState<RegionKey>('tokyo');
  const [areaId, setAreaId] = useState<string>('shibuya');
  const [landmark, setLandmark] = useState('');
  const [focus, setFocus] = useState<MapFocusPin | null>(null);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [recommendation, setRecommendation] = useState<RecommendationPayload | null>(null);
  const [trends, setTrends] = useState<TrendItem[]>([]);
  const [loading, setLoading] = useState<'recommend' | 'trend' | null>(null);
  const [activeAiTab, setActiveAiTab] = useState<'recommend' | 'trend'>('recommend');
  const [error, setError] = useState('');

  const region = getRegion(regionKey);
  const selectedArea = region.areas.find((area) => area.id === areaId) ?? region.areas[0];
  const center = useMemo<[number, number]>(() => [selectedArea.lat, selectedArea.lng], [selectedArea]);

  const saveFavorite = (item: unknown) => setFavorites((prev) => [item, ...prev]);

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
        <div className="role-badge">{role === 'admin' ? 'ADMIN' : 'USER'}</div>
      </header>

      <main className="main-grid">
        <section className="hero-card">
          <p className="eyebrow">MAP × EXPERIENCE</p>
          <h1>地図体験を軸にした Spot / AI / Favorite アプリを新規で再構築します。</h1>
          <p>旧 fallback は持ち込まず、Spot・Recommendation・Trend を明確に分離した設計です。</p>
        </section>

        <section className="filters-card">
          <div className="filters-card__title">地域選択</div>
          <div className="segmented">
            {REGIONS.map((candidate) => (
              <button
                key={candidate.key}
                className={candidate.key === regionKey ? 'segmented__item is-active' : 'segmented__item'}
                onClick={() => {
                  setRegionKey(candidate.key);
                  setAreaId(candidate.areas[0].id);
                  setFocus(null);
                }}
              >
                {candidate.label}
              </button>
            ))}
          </div>
          <div className="filter-grid">
            <label>
              <span>国</span>
              <input value={region.countryJa} readOnly />
            </label>
            <label>
              <span>都道府県 / 州</span>
              <input value={region.stateJa} readOnly />
            </label>
            <label>
              <span>市区町村 / エリア</span>
              <select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
                {region.areas.map((area: RegionArea) => (
                  <option key={area.id} value={area.id}>{area.labelJa}</option>
                ))}
              </select>
            </label>
            <label>
              <span>住所 / ランドマーク</span>
              <input value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="任意" />
            </label>
          </div>
        </section>

        {tab === 'map' && (
          <MapPanel center={center} spots={DEMO_SPOTS} focus={focus} onFavorite={saveFavorite} />
        )}

        {tab === 'ai' && (
          <section className="panel ai-panel">
            <div className="segmented segmented--wide">
              <button className={activeAiTab === 'recommend' ? 'segmented__item is-active' : 'segmented__item'} onClick={() => setActiveAiTab('recommend')}>
                RECOMMENDATION
              </button>
              <button className={activeAiTab === 'trend' ? 'segmented__item is-active' : 'segmented__item'} onClick={() => setActiveAiTab('trend')}>
                TREND
              </button>
            </div>
            <div className="action-row">
              <button className="primary-button" onClick={fetchRecommendation} disabled={loading === 'recommend'}>
                {loading === 'recommend' ? 'Recommendation 取得中...' : 'Recommendation を取得'}
              </button>
              <button className="secondary-button" onClick={fetchTrends} disabled={loading === 'trend'}>
                {loading === 'trend' ? 'Trend 取得中...' : 'Trend を取得'}
              </button>
            </div>
            {error ? <div className="error-box">{error}</div> : null}
            {activeAiTab === 'recommend' ? (
              <RecommendationList data={recommendation} onViewMap={handleViewMap} onSave={saveFavorite} />
            ) : (
              <TrendList items={trends} onSave={saveFavorite} />
            )}
          </section>
        )}

        {tab === 'favorite' && (
          <section className="panel">
            <h2>Favorite</h2>
            {!favorites.length ? <div className="empty-box">まだお気に入りはありません。</div> : null}
            <div className="card-grid">
              {favorites.map((item, index) => (
                <article key={index} className="ai-card">
                  <div className="ai-card__eyebrow">Saved</div>
                  <h4>{(item as any).title ?? (item as any).keyword ?? 'Untitled'}</h4>
                  <p>{(item as any).description ?? (item as any).reason ?? ''}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === 'profile' && (
          <section className="panel profile-panel">
            <h2>Profile</h2>
            <div className="profile-stats">
              <div><strong>Role</strong><span>{role}</span></div>
              <div><strong>Favorites</strong><span>{favorites.length}</span></div>
              <div><strong>Current region</strong><span>{region.stateJa} / {selectedArea.labelJa}</span></div>
            </div>
          </section>
        )}
      </main>

      <BottomNav tab={tab} onChange={setTab} />
    </div>
  );
}
