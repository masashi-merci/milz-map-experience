
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
  const [tab, setTab] = useState<AppTab>('map');
  const [regionKey, setRegionKey] = useState<RegionKey>('tokyo');
  const [areaId, setAreaId] = useState<string>('shibuya');
  const [landmark, setLandmark] = useState('');
  const [focus, setFocus] = useState<MapFocusPin | null>(null);
  const [auth, setAuth] = useState<AuthState>({ role: 'user', displayName: 'Guest' });
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
      setAuth({ role: 'admin', displayName: 'Local Demo Admin' });
      setFavorites([]);
      return;
    }

    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) {
      setAuth({ role: 'user', displayName: 'Guest' });
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
        setAuth({ role: 'user', displayName: 'Guest' });
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
          title: 'サンプルスポット',
          description: 'Map pin の挙動確認用サンプルです。',
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
    setSpots(data.map((row: any) => ({
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
    })));
  }

  async function loadFavorites(userId: string) {
    if (!supabase) return;
    const { data } = await supabase.from('favorites').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (!data) return;
    setFavorites(data.map((row: any) => ({
      id: row.item_key,
      itemType: row.item_type,
      title: row.payload_json?.title ?? row.item_key,
      subtitle: row.payload_json?.subtitle,
      lat: row.payload_json?.lat,
      lng: row.payload_json?.lng,
      createdAt: row.created_at,
    })));
  }

  function isFavorite(itemType: FavoriteItem['itemType'], id: string) {
    return favorites.some((item) => item.itemType === itemType && item.id === id);
  }

  async function toggleFavorite(payload: FavoriteItem) {
    const exists = isFavorite(payload.itemType, payload.id);
    setFavorites((prev) => exists ? prev.filter((item) => !(item.itemType === payload.itemType && item.id === payload.id)) : [payload, ...prev]);
    if (!supabase || !auth.userId) return;
    if (exists) {
      await supabase.from('favorites').delete().eq('user_id', auth.userId).eq('item_type', payload.itemType).eq('item_key', payload.id);
      return;
    }
    await supabase.from('favorites').upsert({
      user_id: auth.userId,
      item_type: payload.itemType,
      item_key: payload.id,
      payload_json: { title: payload.title, subtitle: payload.subtitle, lat: payload.lat, lng: payload.lng },
    }, { onConflict: 'user_id,item_type,item_key' });
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
    if (!response.ok) throw new Error(json.error || '画像アップロードに失敗しました。');
    return json.publicUrl as string;
  }

  const submitSpot = async () => {
    if (!draft.title.trim()) {
      setError('Spot タイトルを入力してください。');
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
      setError(err instanceof Error ? err.message : 'Spot の保存に失敗しました。');
    } finally {
      setSavingSpot(false);
    }
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

  const handleViewMap = (item: AIRecommendationItem | FavoriteItem) => {
    if (typeof item.lat !== 'number' || typeof item.lng !== 'number') return;
    setFocus({ title: item.title, description: 'description' in item ? item.description : item.subtitle, lat: item.lat, lng: item.lng });
    setTab('map');
  };

  async function handleSignUp() {
    if (!supabase) {
      setError('Supabase 環境変数が未設定です。');
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
    setError('登録が完了しました。メール確認が必要な設定なら受信箱を確認してください。');
  }

  async function handleSignIn() {
    if (!supabase) {
      setError('Supabase 環境変数が未設定です。');
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
    setAuth({ role: 'user', displayName: 'Guest' });
    setFavorites([]);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">milz</div>
        <div className="role-badge">{auth.role === 'admin' ? 'ADMIN' : 'USER'}</div>
      </header>

      <main className="main-grid">
        <section className="hero-card">
          <p className="eyebrow">MAP × EXPERIENCE</p>
          <h1>スタイリッシュな地図と、AI の Recommendation / Trend をひとつにまとめた clean rebuild。</h1>
          <p>Supabase で認証とデータ、Cloudflare R2 で画像、Pages Functions で AI / upload を動かします。</p>
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
            <MapPanel
              center={center}
              spots={spots}
              focus={focus}
              authRole={auth.role}
              onFavorite={(spot) => toggleFavorite({ id: spot.id, itemType: 'spot', title: spot.title, subtitle: spot.city, lat: spot.lat, lng: spot.lng, createdAt: new Date().toISOString() })}
              onMapPick={onMapPick}
              isFavorite={(spotId) => isFavorite('spot', spotId)}
            />
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
              <RecommendationList
                data={recommendation}
                onViewMap={handleViewMap}
                isSaved={(id) => isFavorite('recommendation', id)}
                onSave={(item) => toggleFavorite({ id: item.id, itemType: 'recommendation', title: item.title, subtitle: item.address, lat: item.lat, lng: item.lng, createdAt: new Date().toISOString() })}
              />
            ) : (
              <TrendList
                items={trends}
                isSaved={(id) => isFavorite('trend', id)}
                onSave={(item) => toggleFavorite({ id: item.id, itemType: 'trend', title: item.keyword, subtitle: item.reason, createdAt: new Date().toISOString() })}
              />
            )}
          </section>
        )}

        {tab === 'favorite' && (
          <section className="panel">
            <h2>Favorite</h2>
            {!favorites.length ? <div className="empty-box">まだお気に入りはありません。</div> : null}
            <div className="card-grid">
              {favorites.map((item) => (
                <article key={`${item.itemType}:${item.id}`} className="ai-card">
                  <div className="ai-card__eyebrow">{item.itemType.toUpperCase()}</div>
                  <h4>{item.title}</h4>
                  {item.subtitle ? <p>{item.subtitle}</p> : null}
                  <div className="ai-card__actions">
                    {(typeof item.lat === 'number' && typeof item.lng === 'number') ? <button onClick={() => handleViewMap(item)}>View on Map</button> : null}
                    <button className="is-saved" onClick={() => toggleFavorite(item)}>♥ Remove</button>
                  </div>
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
            {auth.userId ? (
              <div className="profile-card">
                <p>ログイン中: {auth.displayName || auth.email}</p>
                <p>{auth.email}</p>
                <button className="secondary-button" onClick={handleSignOut}>Logout</button>
              </div>
            ) : (
              <div className="form-grid auth-grid">
                <label><span>表示名</span><input value={authForm.displayName} onChange={(e) => setAuthForm({ ...authForm, displayName: e.target.value })} /></label>
                <label><span>メール</span><input value={authForm.email} onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} /></label>
                <label><span>パスワード</span><input type="password" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} /></label>
                <label><span>アカウント種別</span><select value={authForm.role} onChange={(e) => setAuthForm({ ...authForm, role: e.target.value as UserRole })}><option value="user">User</option><option value="admin">Admin</option></select></label>
                <div className="modal-actions auth-actions">
                  <button className="secondary-button" onClick={handleSignUp} disabled={authLoading}>新規登録</button>
                  <button className="primary-button" onClick={handleSignIn} disabled={authLoading}>ログイン</button>
                </div>
              </div>
            )}
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
              <button className="primary-button" onClick={submitSpot} disabled={savingSpot}>{savingSpot ? 'Saving...' : 'Save Spot'}</button>
            </div>
          </div>
        </div>
      ) : null}

      <BottomNav value={tab} onChange={setTab} />
    </div>
  );
}
