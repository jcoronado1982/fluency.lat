import React, { useRef } from 'react';
import { LuChevronLeft, LuChevronRight } from 'react-icons/lu';

const MIN_SWIPE_DISTANCE = 48;

/**
 * CourseSessionCard — tarjeta grande de "continuar sesión" con carrusel de
 * categorías, progreso y CTA. Presentacional: todo el estado y los datos
 * llegan por props desde DashboardHero.
 */
export default function CourseSessionCard({
    activeCourse,
    carouselItems,
    activeSlide,
    canCycleCourses,
    onCycle,
    categoryLabel,
    courseImage,
    cardsRemaining,
    minutesLeft,
    progressPercent,
    labels,
    language,
    onOpen,
}) {
    const previousCourseLabel = language === 'es' ? 'Categoría anterior' : 'Previous category';
    const nextCourseLabel = language === 'es' ? 'Siguiente categoría' : 'Next category';
    const isDailyReview = Boolean(activeCourse?.isDailyReview);
    const touchStartRef = useRef(null);

    // En móvil (PWA) el carrusel se cambia con swipe horizontal; las flechas
    // se ocultan por CSS en standalone. El gesto vertical sigue scrolleando.
    const handleTouchStart = (event) => {
        const touch = event.targetTouches[0];
        touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    };
    const handleTouchEnd = (event) => {
        if (!canCycleCourses || !touchStartRef.current) return;
        const touch = event.changedTouches[0];
        const deltaX = touchStartRef.current.x - touch.clientX;
        const deltaY = touchStartRef.current.y - touch.clientY;
        touchStartRef.current = null;
        if (Math.abs(deltaX) < MIN_SWIPE_DISTANCE || Math.abs(deltaX) < Math.abs(deltaY)) return;
        onCycle(deltaX > 0 ? 1 : -1);
    };

    return (
        <article
            className="dash-course-card"
            style={{ '--dash-course-image': `url("${courseImage}")` }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            <div className="dash-course-topbar">
                <span className="dash-course-badge">
                    {isDailyReview
                        ? labels.dailyReviewBadge
                        : (activeCourse?.isCurrentGoal ? labels.currentGoal : categoryLabel)}
                </span>
            </div>
            {canCycleCourses && (
                <>
                    <button
                        type="button"
                        className="dash-course-carousel-btn dash-course-carousel-btn--prev"
                        onClick={() => onCycle(-1)}
                        aria-label={previousCourseLabel}
                    >
                        <LuChevronLeft aria-hidden />
                    </button>
                    <button
                        type="button"
                        className="dash-course-carousel-btn dash-course-carousel-btn--next"
                        onClick={() => onCycle(1)}
                        aria-label={nextCourseLabel}
                    >
                        <LuChevronRight aria-hidden />
                    </button>
                    <div className="dash-course-carousel-dots" aria-hidden>
                        {carouselItems.map((item, index) => (
                            <span
                                key={item.key}
                                className={`dash-course-carousel-dot ${index === activeSlide ? 'is-active' : ''}`}
                            />
                        ))}
                    </div>
                </>
            )}
            <h2>{isDailyReview ? labels.dailyReviewTitle : labels.courseTitle.replace('{category}', categoryLabel)}</h2>
            <p>
                {isDailyReview
                    ? labels.dailyReviewMeta
                    : activeCourse?.resumeSession
                    ? labels.courseMeta
                        .replace('{category}', categoryLabel)
                        .replace('{deck}', activeCourse.deckLabel || activeCourse.deckName || labels.defaultDeck)
                    : labels.missionFallback}
            </p>
            {cardsRemaining > 0 && (
                <span className="dash-course-progress-copy">
                    {isDailyReview
                        ? labels.dailyReviewCards.replace('{n}', String(cardsRemaining))
                        : (
                            <>
                                {labels.cardsRemaining.replace('{n}', String(cardsRemaining))}
                                {' · '}
                                {labels.minutesLeft.replace('{n}', String(minutesLeft))}
                            </>
                        )}
                </span>
            )}
            <div className="dash-course-progress" aria-hidden="true">
                <span style={{ width: `${progressPercent}%` }} />
            </div>
            <button
                type="button"
                className="dash-course-cta"
                onClick={onOpen}
            >
                {isDailyReview ? labels.dailyReviewButton : labels.continueButton}
            </button>
        </article>
    );
}
