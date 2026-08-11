import React from 'react';
import AnimatedNumber from './AnimatedNumber';

/**
 * StatsSideStack — columna lateral del hero: anillo de XP del nivel actual
 * y mini-estadísticas (nivel + racha, palabras del nivel). Presentacional.
 */
const RING = 156;
const STROKE = 12;
const RADIUS = (RING - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function ProgressRing({ percent, labels, value, target, locale }) {
    const offset = CIRCUMFERENCE - (percent / 100) * CIRCUMFERENCE;

    return (
        <div className="dash-main-ring-wrap">
            <svg className="dash-main-ring" width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`} aria-hidden>
                <circle className="dash-main-ring-track" cx={RING / 2} cy={RING / 2} r={RADIUS} strokeWidth={STROKE} />
                <circle
                    className="dash-main-ring-fill"
                    cx={RING / 2}
                    cy={RING / 2}
                    r={RADIUS}
                    strokeWidth={STROKE}
                    strokeDasharray={CIRCUMFERENCE}
                    strokeDashoffset={offset}
                />
            </svg>
            <div className="dash-main-ring-copy">
                <strong><AnimatedNumber value={value} duration={900} /></strong>
                <small>/ {target.toLocaleString(locale)} {labels.xpLabel}</small>
                <span><AnimatedNumber value={percent} duration={900} />% {percent === 100 ? labels.ringComplete : labels.ringGoal}</span>
            </div>
        </div>
    );
}

function LevelIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M4 19V5M20 19V5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path
                d="M4 8h16M4 16h16M8 5v14M16 5v14"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
            />
        </svg>
    );
}

function WordsIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M5 8h8M5 12h6M5 16h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path
                d="M14 7h5v10h-5M17 7v10"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path d="M14 12h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

function StreakInlineIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
                d="M12.5 3.5c.8 3.5 4.6 4.8 4.6 9.1a5.1 5.1 0 0 1-10.2 0c0-2.7 1.6-4.8 3.2-6.4.2 2 1.2 3.1 2.4 3.8.6-1.4.7-3.4 0-6.5Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

export default function StatsSideStack({ level, labels, locale, xpInLevel, xpTarget, streakMsg }) {
    return (
        <aside className="dash-side-stack">
            <article className="dash-ring-card">
                <ProgressRing
                    percent={level.levelPercent}
                    labels={labels}
                    value={xpInLevel}
                    target={xpTarget}
                    locale={locale}
                />
            </article>

            <div className="dash-mini-stats">
                <article className="dash-mini-stat dash-mini-stat--level">
                    <span className="dash-mini-stat-icon" aria-hidden>
                        <LevelIcon />
                    </span>
                    <div className="dash-mini-stat-copy">
                        <span className="dash-level-line">
                            <strong>{level.currentLevel}</strong>
                            <small>{labels.levelShort}</small>
                        </span>
                        <span className="dash-streak-line">
                            <StreakInlineIcon />
                            <small>{streakMsg}</small>
                        </span>
                    </div>
                </article>
                <article className="dash-mini-stat dash-mini-stat--words">
                    <span className="dash-mini-stat-icon" aria-hidden>
                        <WordsIcon />
                    </span>
                    <div className="dash-mini-stat-copy">
                        <strong>{level.wordsInLevel.toLocaleString(locale)} / {level.targetForLevel.toLocaleString(locale)}</strong>
                        <small>{level.currentLevel} · {labels.wordsStatLabel}</small>
                    </div>
                </article>
            </div>
        </aside>
    );
}
