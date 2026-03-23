
import type { AIRecommendationItem, RecommendationPayload, TrendItem } from '../types/app';

export function RecommendationList({
  data,
  onViewMap,
  onSave,
  isSaved,
}: {
  data: RecommendationPayload;
  onViewMap: (item: AIRecommendationItem) => void;
  onSave: (item: AIRecommendationItem) => void;
  isSaved: (id: string) => boolean;
}) {
  const renderGroup = (title: string, items: AIRecommendationItem[]) => (
    <section className="ai-group">
      <div className="ai-group__header"><h3>{title}</h3><span>{items.length ? `${items.length}件` : '0件'}</span></div>
      {!items.length ? <div className="empty-box">まだ結果はありません。</div> : null}
      <div className="card-grid">
        {items.map((item, index) => (
          <article key={item.id} className="ai-card">
            <div className="ai-card__eyebrow">{title} {index + 1}</div>
            <h4>{item.title}</h4>
            <p>{item.description}</p>
            {item.address ? <small>{item.address}</small> : null}
            <div className="ai-card__actions">
              <button onClick={() => onViewMap(item)}>View on Map</button>
              <button className={isSaved(item.id) ? 'is-saved' : ''} onClick={() => onSave(item)}>{isSaved(item.id) ? '♥ Saved' : '♡ Save'}</button>
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

export function TrendList({
  items,
  onSave,
  isSaved,
}: {
  items: TrendItem[];
  onSave: (item: TrendItem) => void;
  isSaved: (id: string) => boolean;
}) {
  if (!items.length) return <div className="empty-box">まだ結果はありません。地域を選んで取得してください。</div>;
  return (
    <div className="card-grid">
      {items.map((item, index) => (
        <article key={item.id} className="ai-card">
          <div className="ai-card__eyebrow">#{index + 1}</div>
          <h4>{item.keyword}</h4>
          <p>{item.reason}</p>
          <div className="ai-card__actions">
            <button className={isSaved(item.id) ? 'is-saved' : ''} onClick={() => onSave(item)}>{isSaved(item.id) ? '♥ Saved' : '♡ Save'}</button>
            {item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer">Googleで確認</a> : null}
          </div>
        </article>
      ))}
    </div>
  );
}
