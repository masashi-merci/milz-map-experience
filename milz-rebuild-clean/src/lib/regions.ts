import type { AppLanguage, RegionMaster } from '../types/app';

export const REGIONS: RegionMaster[] = [
  {
    key: 'hawaii',
    labelJa: 'ハワイ',
    labelEn: 'Hawaii',
    countryJa: 'アメリカ',
    countryEn: 'USA',
    stateJa: 'ハワイ州',
    stateEn: 'Hawaii',
    center: [21.3069, -157.8583],
    areas: [
      { id: 'honolulu', labelJa: 'ホノルル', labelEn: 'Honolulu', lat: 21.3069, lng: -157.8583 },
      { id: 'waikiki', labelJa: 'ワイキキ', labelEn: 'Waikiki', lat: 21.2793, lng: -157.8294 },
      { id: 'kapolei', labelJa: 'カポレイ', labelEn: 'Kapolei', lat: 21.3356, lng: -158.0858 },
    ],
  },
  {
    key: 'new-york',
    labelJa: 'ニューヨーク',
    labelEn: 'New York',
    countryJa: 'アメリカ',
    countryEn: 'USA',
    stateJa: 'ニューヨーク州',
    stateEn: 'New York',
    center: [40.7831, -73.9712],
    areas: [
      { id: 'manhattan', labelJa: 'マンハッタン', labelEn: 'Manhattan', lat: 40.7831, lng: -73.9712 },
      { id: 'soho', labelJa: 'ソーホー', labelEn: 'SoHo', lat: 40.7233, lng: -74.003 },
      { id: 'brooklyn', labelJa: 'ブルックリン', labelEn: 'Brooklyn', lat: 40.6782, lng: -73.9442 },
    ],
  },
  {
    key: 'tokyo',
    labelJa: '東京',
    labelEn: 'Tokyo',
    countryJa: '日本',
    countryEn: 'Japan',
    stateJa: '東京都',
    stateEn: 'Tokyo',
    center: [35.6762, 139.6503],
    areas: [
      { id: 'shibuya', labelJa: '渋谷', labelEn: 'Shibuya', lat: 35.6618, lng: 139.7041 },
      { id: 'shinjuku', labelJa: '新宿', labelEn: 'Shinjuku', lat: 35.6938, lng: 139.7034 },
      { id: 'suginami', labelJa: '杉並区', labelEn: 'Suginami', lat: 35.6995, lng: 139.6364 },
      { id: 'tachikawa', labelJa: '立川市', labelEn: 'Tachikawa', lat: 35.7138, lng: 139.4075 },
      { id: 'shimokitazawa', labelJa: '下北沢', labelEn: 'Shimokitazawa', lat: 35.6617, lng: 139.6687 },
    ],
  },
  {
    key: 'kyoto',
    labelJa: '京都',
    labelEn: 'Kyoto',
    countryJa: '日本',
    countryEn: 'Japan',
    stateJa: '京都府',
    stateEn: 'Kyoto',
    center: [35.0116, 135.7681],
    areas: [
      { id: 'higashiyama', labelJa: '東山', labelEn: 'Higashiyama', lat: 34.9965, lng: 135.7786 },
      { id: 'gion', labelJa: '祇園', labelEn: 'Gion', lat: 35.0037, lng: 135.7788 },
      { id: 'arashiyama', labelJa: '嵐山', labelEn: 'Arashiyama', lat: 35.0094, lng: 135.6668 },
    ],
  },
  {
    key: 'osaka',
    labelJa: '大阪',
    labelEn: 'Osaka',
    countryJa: '日本',
    countryEn: 'Japan',
    stateJa: '大阪府',
    stateEn: 'Osaka',
    center: [34.6937, 135.5023],
    areas: [
      { id: 'umeda', labelJa: '梅田', labelEn: 'Umeda', lat: 34.7055, lng: 135.4983 },
      { id: 'namba', labelJa: '難波', labelEn: 'Namba', lat: 34.667, lng: 135.501 },
      { id: 'tennoji', labelJa: '天王寺', labelEn: 'Tennoji', lat: 34.6466, lng: 135.513 },
    ],
  },
  {
    key: 'korea',
    labelJa: '韓国',
    labelEn: 'Korea',
    countryJa: '韓国',
    countryEn: 'Korea',
    stateJa: 'ソウル',
    stateEn: 'Seoul',
    center: [37.5665, 126.978],
    areas: [
      { id: 'jung-gu', labelJa: '中区', labelEn: 'Jung-gu', lat: 37.5636, lng: 126.997 },
      { id: 'myeongdong', labelJa: '明洞', labelEn: 'Myeongdong', lat: 37.5636, lng: 126.985 },
      { id: 'hongdae', labelJa: '弘大', labelEn: 'Hongdae', lat: 37.5563, lng: 126.9236 },
    ],
  },
];

export const getRegion = (key: string) => REGIONS.find((region) => region.key === key) ?? REGIONS[0];
export const regionLabel = (region: RegionMaster, language: AppLanguage) => language === 'ja' ? region.labelJa : region.labelEn;
export const stateLabel = (region: RegionMaster, language: AppLanguage) => language === 'ja' ? region.stateJa : region.stateEn;
export const countryLabel = (region: RegionMaster, language: AppLanguage) => language === 'ja' ? region.countryJa : region.countryEn;
export const areaLabel = (labelJa: string, labelEn: string, language: AppLanguage) => language === 'ja' ? labelJa : labelEn;
