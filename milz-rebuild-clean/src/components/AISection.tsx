import type { AIRecommendationItem, RecommendationPayload, TrendItem } from '../types/app';

export function RecommendationList({
  data,
  onViewMap,
  onSave,
}: {
  data: RecommendationPayload;
  onViewMap: (item: AIRecommendationItem) => void;
  onSave: (item: AIRecommendationItem) => void;
}) {
  const renderGroup = (title: string, items: AIRecommendationItem[]) => (
    <section className="ai-group">
      <h3>{title}</h3>
      {!items.length ? <div className="empty-box">まだ結果はありません。</div> : null}
      <div className="card-grid">
        {items.map((item, index) => (
          <article key={item.id} className="ai-card">
            <div className="ai-card__eyebrow">{title} {index + 1}</div>
            <h4>{item.title}</h4>
            <p>{item.description}</p>
            <small>{item.address ?? '住所未設定'}</small>
            <div className="ai-card__actions">
              <button onClick={() => onViewMap(item)}>View on Map</button>
              <button onClick={() => onSave(item)}>♡ Save</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );

  return (
    <div className="ai-section-content">
      {renderGroup('観光地', data.sightseeing)}
      {renderGroup('飲食店', data.food)}
    </div>
  );
}

export function TrendList({ items, onSave }: { items: TrendItem[]; onSave: (item: TrendItem) => void }) {
  if (!items.length) return <div className="empty-box">この地域の検索候補はまだ取得されていません。</div>;
  return (
    <div className="card-grid">
      {items.map((item, index) => (
        <article key={item.id} className="ai-card">
          <div className="ai-card__eyebrow">Trend {index + 1}</div>
          <h4>{item.keyword}</h4>
          <p>{item.reason}</p>
          <div className="ai-card__actions">
            <button onClick={() => onSave(item)}>♡ Save</button>
            {item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer">Googleで確認</a> : null}
          </div>
        </article>
      ))}
    </div>
  );
}
