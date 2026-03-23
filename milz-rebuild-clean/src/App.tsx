import { useEffect, useMemo, useState } from 'react';
import { BottomNav } from './components/BottomNav';
import { MapPanel } from './components/MapPanel';
import { RecommendationList, TrendList } from './components/AISection';
import { t } from './lib/i18n';
import { REGIONS, areaLabel, countryLabel, getRegion, regionLabel, stateLabel } from './lib/regions';
import { isSupabaseReady, supabase } from './lib/supabase';
import type {
  AIRecommendationItem,
  AppLanguage,
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
  UserRole,
} from './types/app';

const EMPTY_RECOMMENDATION: RecommendationPayload = { sightseeing: [], food: [] };

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

const blankAuthForm = { email: '', password: '', displayName: '', role: 'user' as UserRole };

export default function App() {
  const [language, setLanguage] = useState<AppLanguage>('ja');
  const labels = t(language);
  const [tab, setTab] = useState<AppTab>('map');
  const [regionKey, setRegionKey] = useState<RegionKey>('tokyo');
  const [areaId, setAreaId] = useState<string>('shibuya');
  const [landmark, setLandmark] = useState('');
  const [focus, setFocus] = useState<MapFocusPin | null>(null);
  const [auth, setAuth] = useState<AuthState>({ role: 'user', displayName: labels.guest });
  const [authLoading, setAuthLoading] = useState(true);
  const [authForm, setAuthForm] = useState(blankAuthForm);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [recommendation, setRecommendation] = useState<RecommendationPayload>(EMPTY_RECOMMENDATION);
  const [trends, setTrends] = useState<TrendItem[]>([]);
  const [loading, setLoading] = useState<'recommend' | 'trend' | null>(null);
  const [activeAiTab, setActiveAiTab] = useState<'recommend' | 'trend'>('recommend');
  const [error, setError] = useState('');
  const [showSpotModal, setShowSpotModal] = useState(false);
  const [draft, setDraft] = useState<SpotDraft>(blankDraft());
  const [savingSpot, setSavingSpot] = useState(false);

  const region = getRegion(regionKey);
  const selectedArea = region.areas.find((area) => area.id === areaId) ?? region.areas[0];
  const center = useMemo<[number, number]>(() => [selectedArea.lat, selectedArea.lng], [selectedArea]);

  useEffect(() => {
    setDraft(blankDraft(region, selectedArea));
  }, [regionKey, areaId]);

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    setAuth((prev) => ({ ...prev, displayName: prev.userId ? prev.displayName : labels.guest }));
  }, [language]);

  async function bootstrap() {
    setAuthLoading(true);
    try {
      await loadSession();
      await loadSpots();
    } finally {
      setAuthLoading(false);
    }
  }

  async function loadSession() {
    if (!isSupabaseReady || !supabase) {
      setAuth({ role: 'admin', displayName: language === 'ja' ? 'ローカルデモ' : 'Local Demo' });
      setFavorites([]);
      return;
    }

    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) {
      setAuth({ role: 'user', displayName: labels.guest });
      setFavorites([]);
      return;
    }

    const user = data.session.user;
    const { data: profile } = await supabase
      .from('profiles')
      .select('role,display_name')
      .eq('id', user.id)
      .maybeSingle();

    setAuth({
      userId: user.id,
      email: user.email,
      role: (profile?.role as UserRole) ?? 'user',
      displayName: profile?.display_name ?? user.user_metadata?.display_name ?? user.email,
    });

    await loadFavorites(user.id);

    const client = supabase;
    if (!client) return;

    client.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        setAuth({ role: 'user', displayName: labels.guest });
        setFavorites([]);
        return;
      }
      const nextUser = session.user;
      const { data: nextProfile } = await client
        .from('profiles')
        .select('role,display_name')
        .eq('id', nextUser.id)
        .maybeSingle();
      setAuth({
        userId: nextUser.id,
        email: nextUser.email,
        role: (nextProfile?.role as UserRole) ?? 'user',
        displayName: nextProfile?.display_name ?? nextUser.user_metadata?.display_name ?? nextUser.email,
      });
      await loadFavorites(nextUser.id);
    });
  }

  async function loadSpots() {
    if (!supabase) {
      setSpots([
        {
          id: 'demo-1',
          title: language === 'ja' ? 'サンプルスポット' : 'Sample Spot',
          description: language === 'ja' ? 'Map pin の確認用サンプルです。' : 'Demo spot for map pin checks.',
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
    const { data } = await supabase.from('spots').select('*').order('created_at', { ascending: false }).limit(200);
    if (!data) return;
    setSpots(
      data.map((row: any) => ({
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
      }))
    );
  }

  async function loadFavorites(userId: string) {
    if (!supabase) return;
    const { data } = await supabase.from('favorites').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (!data) return;
    setFavorites(
      data.map((row: any) => ({
        id: row.item_key,
        itemType: row.item_type,
        title: row.payload_json?.title ?? row.item_key,
        subtitle: row.payload_json?.subtitle,
        lat: row.payload_json?.lat,
        lng: row.payload_json?.lng,
        createdAt: row.created_at,
      }))
    );
  }

  function isFavorite(itemType: FavoriteItem['itemType'], id: string) {
    return favorites.some((item) => item.itemType === itemType && item.id === id);
  }

  async function toggleFavorite(payload: FavoriteItem) {
    const exists = isFavorite(payload.itemType, payload.id);
    setFavorites((prev) =>
      exists ? prev.filter((item) => !(item.itemType === payload.itemType && item.id === payload.id)) : [payload, ...prev]
    );
    if (!supabase || !auth.userId) return;
    if (exists) {
      await supabase.from('favorites').delete().eq('user_id', auth.userId).eq('item_type', payload.itemType).eq('item_key', payload.id);
      return;
    }
    await supabase.from('favorites').upsert(
      {
        user_id: auth.userId,
        item_type: payload.itemType,
        item_key: payload.id,
        payload_json: { title: payload.title, subtitle: payload.subtitle, lat: payload.lat, lng: payload.lng },
      },
      { onConflict: 'user_id,item_type,item_key' }
    );
  }

  const onMapPick = (lat: number, lng: number) => {
    if (auth.role !== 'admin') return;
    setDraft((prev) => ({ ...prev, lat, lng }));
    setShowSpotModal(true);
    setTab('map');
  };

  async function uploadSpotImage(file: File, spotId: string) {
    const form = new FormData();
    form.append('file', file);
    form.append('spotId', spotId);
    const response = await fetch('/api/uploads/image', { method: 'POST', body: form });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error || 'Upload failed.');
    return json.publicUrl as string;
  }

  const submitSpot = async () => {
    if (!draft.title.trim()) {
      setError(language === 'ja' ? 'Spot タイトルを入力してください。' : 'Please enter a spot title.');
      return;
    }
    setSavingSpot(true);
    setError('');
    const newId = crypto.randomUUID();
    let imageUrl: string | undefined;
    try {
      if (draft.imageFile) {
        imageUrl = await uploadSpotImage(draft.imageFile, newId);
      }

      const newSpot: Spot = {
        id: newId,
        title: draft.title,
        description: draft.description,
        website: draft.website || undefined,
        imageUrl,
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
      setFocus({ title: newSpot.title, description: newSpot.description, lat: newSpot.lat, lng: newSpot.lng });
      setTab('map');

      if (supabase && auth.userId) {
        await supabase.from('spots').insert({
          id: newId,
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
      }
      setDraft(blankDraft(region, selectedArea));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Spot save failed.');
    } finally {
      setSavingSpot(false);
    }
  };

  const queryBody = {
    country: countryLabel(region, language),
    state: stateLabel(region, language),
    cityArea: areaLabel(selectedArea.labelJa, selectedArea.labelEn, language),
    landmark,
    lang: language,
  };

  const fetchRecommendation = async () => {
    setLoading('recommend');
    setActiveAiTab('recommend');
    setError('');
    try {
      const response = await fetch('/api/ai/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'recommendation', ...queryBody }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Recommendation fetch failed.');
      setRecommendation(json.data as RecommendationPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recommendation fetch failed.');
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
        body: JSON.stringify({ mode: 'trend', ...queryBody }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Trend fetch failed.');
      setTrends(json.data as TrendItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Trend fetch failed.');
    } finally {
      setLoading(null);
    }
  };

  const handleViewMap = (item: AIRecommendationItem | FavoriteItem) => {
    if (typeof item.lat !== 'number' || typeof item.lng !== 'number') return;
    setFocus({
      title: item.title,
      description: 'description' in item ? item.description : item.subtitle,
      lat: item.lat,
      lng: item.lng,
    });
    setTab('map');
  };

  async function handleSignUp() {
    if (!supabase) {
      setError(language === 'ja' ? 'Supabase 環境変数が未設定です。' : 'Supabase env vars are missing.');
      return;
    }
    const { error: signUpError } = await supabase.auth.signUp({
      email: authForm.email,
      password: authForm.password,
      options: { data: { display_name: authForm.displayName, role: authForm.role } },
    });
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    setError(language === 'ja' ? '登録が完了しました。' : 'Sign up completed.');
  }

  async function handleSignIn() {
    if (!supabase) {
      setError(language === 'ja' ? 'Supabase 環境変数が未設定です。' : 'Supabase env vars are missing.');
      return;
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: authForm.email, password: authForm.password });
    if (signInError) {
      setError(signInError.message);
      return;
    }
    setError('');
    await loadSession();
    await loadSpots();
  }

  async function handleSignOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setAuth({ role: 'user', displayName: labels.guest });
    setFavorites([]);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand">{labels.brand}</div>
          <div className="subtle-line">{labels.aiFocus}</div>
        </div>
        <div className="topbar__right">
          <div className="lang-toggle">
            <button className={language === 'ja' ? 'segmented__item is-active' : 'segmented__item'} onClick={() => setLanguage('ja')}>JP</button>
            <button className={language === 'en' ? 'segmented__item is-active' : 'segmented__item'} onClick={() => setLanguage('en')}>EN</button>
          </div>
          <div className="role-badge">{auth.role === 'admin' ? labels.roleAdmin : labels.roleUser}</div>
        </div>
      </header>

      <main className="main-grid">
        <section className="filters-card compact-card">
          <div className="filters-card__title">{labels.region}</div>
          <div className="segmented compact-scroll">
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
                {regionLabel(candidate, language)}
              </button>
            ))}
          </div>
          <div className="filter-grid compact-grid">
            <label><span>{labels.country}</span><input value={countryLabel(region, language)} readOnly /></label>
            <label><span>{labels.state}</span><input value={stateLabel(region, language)} readOnly /></label>
            <label>
              <span>{labels.city}</span>
              <select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
                {region.areas.map((area: RegionArea) => (
                  <option key={area.id} value={area.id}>{areaLabel(area.labelJa, area.labelEn, language)}</option>
                ))}
              </select>
            </label>
            <label><span>{labels.landmark}</span><input value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder={labels.optional} /></label>
          </div>
        </section>

        <section className={tab === 'map' ? 'tab-panel is-active' : 'tab-panel'} aria-hidden={tab !== 'map'}>
          <MapPanel
            center={center}
            spots={spots}
            focus={focus}
            authRole={auth.role}
            onFavorite={(spot) =>
              toggleFavorite({
                id: spot.id,
                itemType: 'spot',
                title: spot.title,
                subtitle: spot.city,
                lat: spot.lat,
                lng: spot.lng,
                createdAt: new Date().toISOString(),
              })
            }
            onMapPick={onMapPick}
            isFavorite={(spotId) => isFavorite('spot', spotId)}
            language={language}
            tabActive={tab === 'map'}
          />
          {auth.role === 'admin' ? <button className="floating-add" onClick={() => setShowSpotModal(true)}>{labels.spotRegister}</button> : null}
        </section>

        <section className={tab === 'ai' ? 'tab-panel is-active' : 'tab-panel'} aria-hidden={tab !== 'ai'}>
          <section className="panel ai-panel">
            <div className="segmented segmented--wide">
              <button className={activeAiTab === 'recommend' ? 'segmented__item is-active' : 'segmented__item'} onClick={() => setActiveAiTab('recommend')}>{labels.recommendation}</button>
              <button className={activeAiTab === 'trend' ? 'segmented__item is-active' : 'segmented__item'} onClick={() => setActiveAiTab('trend')}>{labels.trend}</button>
            </div>
            <div className="ai-toolbar">
              <div className="ai-panel__hint">{activeAiTab === 'recommend' ? labels.recommendationHint : labels.trendHint}</div>
              {activeAiTab === 'recommend' ? (
                <button className="primary-button primary-button--wide" onClick={fetchRecommendation} disabled={loading === 'recommend'}>
                  {loading === 'recommend' ? labels.getRecommendationLoading : labels.getRecommendation}
                </button>
              ) : (
                <button className="primary-button primary-button--wide" onClick={fetchTrends} disabled={loading === 'trend'}>
                  {loading === 'trend' ? labels.getTrendLoading : labels.getTrend}
                </button>
              )}
            </div>
            {error ? <div className="error-box">{error}</div> : null}
            {activeAiTab === 'recommend' ? (
              <RecommendationList
                data={recommendation}
                onViewMap={handleViewMap}
                isSaved={(id) => isFavorite('recommendation', id)}
                onSave={(item) =>
                  toggleFavorite({
                    id: item.id,
                    itemType: 'recommendation',
                    title: item.title,
                    subtitle: item.address,
                    lat: item.lat,
                    lng: item.lng,
                    createdAt: new Date().toISOString(),
                  })
                }
                language={language}
              />
            ) : (
              <TrendList
                items={trends}
                isSaved={(id) => isFavorite('trend', id)}
                onSave={(item) =>
                  toggleFavorite({
                    id: item.id,
                    itemType: 'trend',
                    title: item.keyword,
                    subtitle: item.reason,
                    createdAt: new Date().toISOString(),
                  })
                }
                language={language}
              />
            )}
          </section>
        </section>

        <section className={tab === 'favorite' ? 'tab-panel is-active' : 'tab-panel'} aria-hidden={tab !== 'favorite'}>
          <section className="panel">
            <h2>{labels.favorite}</h2>
            {!favorites.length ? <div className="empty-box">{labels.noFavorites}</div> : null}
            <div className="card-grid">
              {favorites.map((item) => (
                <article key={`${item.itemType}:${item.id}`} className="ai-card">
                  <div className="ai-card__eyebrow">{labels.favoriteType(item.itemType)}</div>
                  <h4>{item.title}</h4>
                  {item.subtitle ? <p>{item.subtitle}</p> : null}
                  <div className="ai-card__actions">
                    {typeof item.lat === 'number' && typeof item.lng === 'number' ? <button onClick={() => handleViewMap(item)}>{labels.viewOnMap}</button> : null}
                    <button className="is-saved" onClick={() => toggleFavorite(item)}>♥ {labels.favoriteRemove}</button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </section>

        <section className={tab === 'profile' ? 'tab-panel is-active' : 'tab-panel'} aria-hidden={tab !== 'profile'}>
          <section className="panel profile-panel">
            <h2>{labels.profileTitle}</h2>
            <div className="profile-stats">
              <div><span>{language === 'ja' ? 'Role' : 'Role'}</span><strong>{auth.role.toUpperCase()}</strong></div>
              <div><span>{labels.spot}</span><strong>{spots.length}</strong></div>
              <div><span>{labels.favoritesLabel}</span><strong>{favorites.length}</strong></div>
            </div>
            {auth.userId ? (
              <div className="profile-card">
                <p>{auth.displayName || auth.email}</p>
                <p>{auth.email}</p>
                <button className="secondary-button" onClick={handleSignOut}>{labels.logout}</button>
              </div>
            ) : (
              <div className="form-grid auth-grid">
                <label><span>{labels.displayName}</span><input value={authForm.displayName} onChange={(e) => setAuthForm({ ...authForm, displayName: e.target.value })} /></label>
                <label><span>{labels.email}</span><input value={authForm.email} onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} /></label>
                <label><span>{labels.password}</span><input type="password" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} /></label>
                <label><span>{labels.accountType}</span><select value={authForm.role} onChange={(e) => setAuthForm({ ...authForm, role: e.target.value as UserRole })}><option value="user">User</option><option value="admin">Admin</option></select></label>
                <div className="modal-actions auth-actions">
                  <button className="secondary-button" onClick={handleSignUp} disabled={authLoading}>{labels.signup}</button>
                  <button className="primary-button" onClick={handleSignIn} disabled={authLoading}>{labels.login}</button>
                </div>
              </div>
            )}
          </section>
        </section>
      </main>

      {showSpotModal ? (
        <div className="modal-backdrop" onClick={() => setShowSpotModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>{labels.spotRegister}</h3>
            <div className="form-grid">
              <label><span>{labels.title}</span><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
              <label><span>{labels.category}</span><select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as SpotDraft['category'] })}><option value="sightseeing">{labels.sightseeing}</option><option value="food">{labels.food}</option><option value="other">Other</option></select></label>
              <label className="form-grid__full"><span>{labels.description}</span><textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
              <label><span>{labels.website}</span><input value={draft.website} onChange={(e) => setDraft({ ...draft, website: e.target.value })} /></label>
              <label><span>{labels.image}</span><input type="file" accept="image/*" onChange={(e) => setDraft({ ...draft, imageFile: e.target.files?.[0] ?? null })} /></label>
              <label className="form-grid__full"><span>{labels.address}</span><input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></label>
            </div>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setShowSpotModal(false)}>{labels.close}</button>
              <button className="primary-button" onClick={submitSpot} disabled={savingSpot}>{savingSpot ? 'Saving…' : labels.saveSpot}</button>
            </div>
          </div>
        </div>
      ) : null}

      <BottomNav value={tab} onChange={setTab} language={language} />
    </div>
  );
}
