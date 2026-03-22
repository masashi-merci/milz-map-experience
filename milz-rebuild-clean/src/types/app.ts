export type AppTab = 'map' | 'ai' | 'favorite' | 'profile';
export type UserRole = 'admin' | 'user';

export type RegionKey = 'hawaii' | 'new-york' | 'tokyo' | 'kyoto' | 'osaka' | 'korea';

export type RegionArea = {
  id: string;
  labelJa: string;
  lat: number;
  lng: number;
};

export type RegionMaster = {
  key: RegionKey;
  countryJa: string;
  stateJa: string;
  label: string;
  center: [number, number];
  areas: RegionArea[];
};

export type SpotCategory = 'sightseeing' | 'food' | 'other';

export type Spot = {
  id: string;
  title: string;
  description: string;
  website?: string;
  imageUrl?: string;
  country: string;
  region: string;
  city: string;
  address?: string;
  lat: number;
  lng: number;
  category: SpotCategory;
  createdAt: string;
};

export type FavoriteItem = {
  id: string;
  itemType: 'spot' | 'recommendation' | 'trend';
  title: string;
  subtitle?: string;
  lat?: number;
  lng?: number;
  createdAt: string;
};

export type AIRecommendationItem = {
  id: string;
  title: string;
  description: string;
  address?: string;
  lat: number;
  lng: number;
  source: 'spot' | 'places';
};

export type RecommendationPayload = {
  sightseeing: AIRecommendationItem[];
  food: AIRecommendationItem[];
};

export type TrendItem = {
  id: string;
  keyword: string;
  reason: string;
  sourceUrl?: string;
};

export type MapFocusPin = {
  title: string;
  description?: string;
  lat: number;
  lng: number;
};

export type AuthState = {
  userId?: string;
  email?: string;
  role: UserRole;
  displayName?: string;
};

export type SpotDraft = {
  title: string;
  description: string;
  website: string;
  imageFile?: File | null;
  country: string;
  region: string;
  city: string;
  address: string;
  lat: number;
  lng: number;
  category: SpotCategory;
};
