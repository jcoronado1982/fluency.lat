import React from 'react';

/**
 * RecommendationsGrid — grilla inferior de accesos rápidos: tarjetas de
 * mazos recomendados con su miniatura. Presentacional: la resolución de
 * imágenes (getItemImage) y la navegación (onOpenItem) llegan por props.
 */
export default function RecommendationsGrid({ items, getItemImage, labels, onOpenItem }) {
    return (
        <div className="dash-bottom-grid">
            {items.map((item) => (
                <button
                    key={`${item.category}-${item.deckName}`}
                    type="button"
                    className="dash-category-card"
                    onClick={() => onOpenItem(item)}
                >
                    <span className="dash-category-card-title">{item.categoryLabel}</span>
                    <span className="dash-category-thumb" style={{ '--dash-category-image': `url("${getItemImage(item)}")` }}>
                        <span>{item.levelId}</span>
                    </span>
                    <strong>{item.deckLabel || item.deckName}</strong>
                    <span className="dash-category-action">{labels.quickAccessButton}</span>
                </button>
            ))}
        </div>
    );
}
