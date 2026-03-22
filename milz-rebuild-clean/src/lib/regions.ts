import type { RegionMaster } from '../types/app';

export const REGIONS: RegionMaster[] = [
  {
    key: 'hawaii',
    label: 'Hawaii',
    countryJa: 'アメリカ',
    stateJa: 'ハワイ州',
    center: [21.3069, -157.8583],
    areas: [
      { id: 'honolulu', labelJa: 'ホノルル', lat: 21.3069, lng: -157.8583 },
      { id: 'waikiki', labelJa: 'ワイキキ', lat: 21.2793, lng: -157.8294 },
      { id: 'kapolei', labelJa: 'カポレイ', lat: 21.3356, lng: -158.0858 }
    ]
  },
  {
    key: 'new-york',
    label: 'New York',
    countryJa: 'アメリカ',
    stateJa: 'ニューヨーク州',
    center: [40.7831, -73.9712],
    areas: [
      { id: 'manhattan', labelJa: 'マンハッタン', lat: 40.7831, lng: -73.9712 },
      { id: 'soho', labelJa: 'ソーホー', lat: 40.7233, lng: -74.0030 },
      { id: 'brooklyn', labelJa: 'ブルックリン', lat: 40.6782, lng: -73.9442 }
    ]
  },
  {
    key: 'tokyo',
    label: 'Tokyo',
    countryJa: '日本',
    stateJa: '東京都',
    center: [35.6762, 139.6503],
    areas: [
      { id: 'shibuya', labelJa: '渋谷', lat: 35.6618, lng: 139.7041 },
      { id: 'shinjuku', labelJa: '新宿', lat: 35.6938, lng: 139.7034 },
      { id: 'suginami', labelJa: '杉並区', lat: 35.6995, lng: 139.6364 },
      { id: 'tachikawa', labelJa: '立川市', lat: 35.7138, lng: 139.4075 },
      { id: 'shimokitazawa', labelJa: '下北沢', lat: 35.6617, lng: 139.6687 }
    ]
  },
  {
    key: 'kyoto',
    label: 'Kyoto',
    countryJa: '日本',
    stateJa: '京都府',
    center: [35.0116, 135.7681],
    areas: [
      { id: 'higashiyama', labelJa: '東山', lat: 34.9965, lng: 135.7786 },
      { id: 'gion', labelJa: '祇園', lat: 35.0037, lng: 135.7788 },
      { id: 'arashiyama', labelJa: '嵐山', lat: 35.0094, lng: 135.6668 }
    ]
  },
  {
    key: 'osaka',
    label: 'Osaka',
    countryJa: '日本',
    stateJa: '大阪府',
    center: [34.6937, 135.5023],
    areas: [
      { id: 'umeda', labelJa: '梅田', lat: 34.7055, lng: 135.4983 },
      { id: 'namba', labelJa: '難波', lat: 34.6670, lng: 135.5010 },
      { id: 'tennoji', labelJa: '天王寺', lat: 34.6466, lng: 135.5130 }
    ]
  },
  {
    key: 'korea',
    label: 'Korea',
    countryJa: '韓国',
    stateJa: 'ソウル',
    center: [37.5665, 126.9780],
    areas: [
      { id: 'jung-gu', labelJa: 'Jung-gu', lat: 37.5636, lng: 126.9970 },
      { id: 'myeongdong', labelJa: '明洞', lat: 37.5636, lng: 126.9850 },
      { id: 'hongdae', labelJa: '弘大', lat: 37.5563, lng: 126.9236 }
    ]
  }
];

export const getRegion = (key: string) => REGIONS.find((region) => region.key === key) ?? REGIONS[0];
