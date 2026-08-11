import React from 'react';
import { Link } from 'react-router-dom';
import { buildLandingDemoImagePath } from '../../../contracts/landingDemoNamespace';

const carouselImage = (cardId, defIndex, width, mobileWidth, form = 'v1') => ({
    cardId,
    defIndex,
    form,
    src: buildLandingDemoImagePath(cardId, defIndex, form),
    width,
    mobileWidth,
});

const TOP_ROW = [
    carouselImage(8, 1, 310, 205),
    carouselImage(1, 0, 340, 225),
    carouselImage(2, 0, 280, 190),
    carouselImage(3, 1, 250, 174),
    carouselImage(4, 0, 350, 232),
    carouselImage(5, 1, 230, 160),
    carouselImage(6, 0, 320, 212),
    carouselImage(7, 1, 210, 150),
];

const BOTTOM_ROW = [
    carouselImage(8, 0, 360, 238),
    carouselImage(5, 3, 215, 150),
    carouselImage(9, 0, 300, 200),
    carouselImage(1, 1, 285, 192, 'v2'),
    carouselImage(7, 0, 350, 232),
    carouselImage(2, 1, 260, 180, 'v3'),
    carouselImage(3, 0, 290, 196, 'v2'),
    carouselImage(6, 1, 220, 154),
];

function ImageGroup({ images, duplicate = false, onSelect, actionLabel }) {
    return (
        <div className="lp-image-carousel-group">
            {images.map((image, index) => (
                <button
                    type="button"
                    className="lp-image-carousel-tile"
                    key={`${image.src}-${index}`}
                    onClick={() => onSelect(image)}
                    aria-label={`${actionLabel} ${image.cardId}`}
                    style={{
                        '--lp-gallery-tile-width': `${image.width}px`,
                        '--lp-gallery-tile-mobile-width': `${image.mobileWidth}px`,
                        backgroundImage: `url(${image.src})`,
                    }}
                >
                    <img
                        src={image.src}
                        alt=""
                        loading={duplicate ? 'lazy' : 'eager'}
                        decoding="async"
                        draggable="false"
                    />
                </button>
            ))}
        </div>
    );
}

function ImageRow({ images, direction, onSelect, actionLabel }) {
    return (
        <div className={`lp-image-carousel-row lp-image-carousel-row--${direction}`}>
            <div className="lp-image-carousel-track">
                <ImageGroup images={images} onSelect={onSelect} actionLabel={actionLabel} />
                <ImageGroup images={images} duplicate onSelect={onSelect} actionLabel={actionLabel} />
            </div>
        </div>
    );
}

export default function DemoImageCarousel({ t, pricingEnabled, onSelectImage }) {
    return (
        <div className="lp-image-showcase">
            <div className="lp-image-showcase-heading">
                <span className="lp-image-showcase-badge">{t.premiumBadgeLabel}</span>
                <h2 className="lp-image-showcase-title">{t.imageShowcaseTitle}</h2>
                <p className="lp-image-showcase-subtitle">{t.imageShowcaseSubtitle}</p>
            </div>

            <div className="lp-image-carousel">
                <ImageRow
                    images={TOP_ROW}
                    direction="left"
                    onSelect={onSelectImage}
                    actionLabel={t.demoInteractiveBadge}
                />
                <ImageRow
                    images={BOTTOM_ROW}
                    direction="right"
                    onSelect={onSelectImage}
                    actionLabel={t.demoInteractiveBadge}
                />
            </div>

            {pricingEnabled && (
                <div className="lp-image-showcase-cta">
                    <Link to="/pricing" className="lp-btn lp-btn--outline">
                        {t.seePremiumCta}
                    </Link>
                </div>
            )}
        </div>
    );
}
