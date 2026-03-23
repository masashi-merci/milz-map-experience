import { t } from '../lib/i18n';
import type { AIRecommendationItem, AppLanguage, RecommendationPayload, TrendItem } from '../types/app';

export function RecommendationList({
  data,
  onViewMap,
  onSave,
  isSaved,
  language,
}: {
  data: RecommendationPayload;
  onViewMap: (item: AIRecommendationItem) => void;
  onSave: (item: AIRecommendationItem) => void;
  isSaved: (id: string) => boolean;
  language: AppLanguage;
}) {
  const labels = t(language);

  const renderGroup = (title: string, items: AIRecommendationItem[]) => (
    <section className="ai-group">
      <div className="ai-group__header"><h3>{title}</h3><span>{items.length ? `${items.length}` : '0'}</span></div>
      {!items.length ? <div className="empty-box">{labels.noResults}</div> : null}
      <div className="card-grid">
        {items.map((item, index) => (
          <article key={item.id} className="ai-card">
            <div className="ai-card__eyebrow">{title} {index + 1}</div>
            <h4>{item.title}</h4>
            <p>{item.description}</p>
            {item.address ? <small>{item.address}</small> : null}
            <div className="ai-card__actions">
              <button onClick={() => onViewMap(item)}>{labels.viewOnMap}</button>
              <button className={isSaved(item.id) ? 'is-saved' : ''} onClick={() => onSave(item)}>{isSaved(item.id) ? `♥ ${labels.saved}` : `♡ ${labels.save}`}</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );

  return (
    <div className="ai-section-content">
      {renderGroup(labels.sightseeing, data.sightseeing)}
      {renderGroup(labels.food, data.food)}
    </div>
  );
}

export function TrendList({
  items,
  onSave,
  isSaved,
  language,
}: {
  items: TrendItem[];
  onSave: (item: TrendItem) => void;
  isSaved: (id: string) => boolean;
  language: AppLanguage;
}) {
  const labels = t(language);
  if (!items.length) return <div className="empty-box">{labels.noResults}</div>;
  return (
    <div className="card-grid">
      {items.map((item, index) => (
        <article key={item.id} className="ai-card">
          <div className="ai-card__eyebrow">#{index + 1}</div>
          <h4>{item.keyword}</h4>
          <p>{item.reason}</p>
          <div className="ai-card__actions">
            <button className={isSaved(item.id) ? 'is-saved' : ''} onClick={() => onSave(item)}>{isSaved(item.id) ? `♥ ${labels.saved}` : `♡ ${labels.save}`}</button>
            {item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer">Google</a> : null}
          </div>
        </article>
      ))}
    </div>
  );
}
