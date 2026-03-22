import { json } from '../../_shared/response';

type RequestBody = {
  mode: 'recommendation' | 'trend';
  regionKey: string;
  country: string;
  state: string;
  cityArea: string;
  landmark?: string;
};

const DEMO_RECOMMENDATIONS: Record<string, { sightseeing: any[]; food: any[] }> = {
  '東京都|渋谷': {
    sightseeing: [
      { id: 'shibuya-1', title: '渋谷スクランブル交差点', description: '渋谷の代表的なランドマークです。', address: '東京都渋谷区', lat: 35.6595, lng: 139.7005, source: 'places' },
      { id: 'shibuya-2', title: '代々木公園', description: '渋谷周辺で立ち寄りやすい大型公園です。', address: '東京都渋谷区代々木神園町', lat: 35.6728, lng: 139.6949, source: 'places' },
      { id: 'shibuya-3', title: '忠犬ハチ公像', description: '待ち合わせの定番スポットです。', address: '東京都渋谷区道玄坂', lat: 35.6591, lng: 139.7017, source: 'places' },
      { id: 'shibuya-4', title: '渋谷ヒカリエ', description: '渋谷駅直結の複合施設です。', address: '東京都渋谷区渋谷', lat: 35.6590, lng: 139.7034, source: 'places' },
      { id: 'shibuya-5', title: '宮下パーク', description: '渋谷駅近くで買い物と散歩の両方に向いています。', address: '東京都渋谷区神宮前', lat: 35.6642, lng: 139.7028, source: 'places' }
    ],
    food: [
      { id: 'shibuya-f1', title: '渋谷の人気ランチ候補', description: '実装時は Places か admin spot から差し替える想定です。', address: '東京都渋谷区', lat: 35.6619, lng: 139.7040, source: 'places' },
      { id: 'shibuya-f2', title: '渋谷の人気カフェ候補', description: '実装時は Places か admin spot から差し替える想定です。', address: '東京都渋谷区', lat: 35.6623, lng: 139.7052, source: 'places' },
      { id: 'shibuya-f3', title: '渋谷の人気レストラン候補', description: '実装時は Places か admin spot から差し替える想定です。', address: '東京都渋谷区', lat: 35.6601, lng: 139.7027, source: 'places' },
      { id: 'shibuya-f4', title: '渋谷の人気ディナー候補', description: '実装時は Places か admin spot から差し替える想定です。', address: '東京都渋谷区', lat: 35.6632, lng: 139.7011, source: 'places' },
      { id: 'shibuya-f5', title: '渋谷の人気スイーツ候補', description: '実装時は Places か admin spot から差し替える想定です。', address: '東京都渋谷区', lat: 35.6588, lng: 139.7061, source: 'places' }
    ]
  }
};

const DEMO_TRENDS: Record<string, { keyword: string; reason: string; sourceUrl?: string }[]> = {
  '東京都|渋谷': [
    { id: 't1', keyword: '渋谷 ランチ', reason: '昼前から当日利用の店探し需要が集中しやすく、価格帯や待ち時間を比較したい検索が伸びやすいです。' },
    { id: 't2', keyword: '渋谷 カフェ', reason: '待ち合わせ、作業、休憩の用途が重なり、近場で入りやすい店を探す検索が増えやすいです。' },
    { id: 't3', keyword: '渋谷 イベント', reason: '週末や期間限定企画の前後は、開催有無や時間、会場導線を確認する検索が増えやすいです。' },
    { id: 't4', keyword: '渋谷 観光', reason: '初回訪問者が見どころや回り方をまとめて確認したい時に検索されやすい語です。' },
    { id: 't5', keyword: '渋谷 ホテル', reason: 'ライブやイベント来訪に合わせて、宿泊場所を直前比較する検索が伸びやすいです。' },
    { id: 't6', keyword: '渋谷 天気', reason: '当日の服装判断や屋外移動の計画のために検索されやすい語です。' },
    { id: 't7', keyword: '渋谷 駐車場', reason: '車で訪れる人が空き状況や料金を事前確認するために検索しやすい語です。' },
    { id: 't8', keyword: '渋谷 スイーツ', reason: '手土産や食べ歩き需要が高い時間帯に比較検索が増えやすいです。' },
    { id: 't9', keyword: '渋谷 デート', reason: '回遊ルートや雰囲気の合う店を探したい時に検索されやすい語です。' },
    { id: 't10', keyword: '渋谷 居酒屋', reason: '夜の集合前後に、立地と予約可否を比較する検索が伸びやすいです。' }
  ] as any
};

export const onRequestPost: PagesFunction = async ({ request }) => {
  const body = (await request.json()) as RequestBody;
  const key = `${body.state}|${body.cityArea}`;

  if (body.mode === 'recommendation') {
    const data = DEMO_RECOMMENDATIONS[key] ?? { sightseeing: [], food: [] };
    return json({ data });
  }

  const data = DEMO_TRENDS[key] ?? [];
  return json({ data });
};
