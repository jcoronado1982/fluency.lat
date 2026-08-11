import React from 'react';
import { isLevelActive } from '../useCases/dashboardProgress';

/**
 * LearningPathCard — tarjeta "Your learning path": la pista de niveles
 * A1 → B2 con líneas de progreso entre pasos. Presentacional.
 */
export function levelCopy(step, labels) {
    if (step.premium) return labels.premiumLevelLabel;
    return labels.levelNames?.[step.id] || step.id;
}

export default function LearningPathCard({ level, mastered, labels, streakMsg }) {
    return (
        <article className="dash-path-card">
            <header className="dash-path-header">
                <h3>{labels.proficiencyPath}</h3>
                <p>{labels.proficiencyPathSub}</p>
            </header>
            <div className="dash-path-steps">
                {level.levels.map((step, index) => {
                    const active = isLevelActive(mastered, step, level.currentLevel);
                    const previous = level.levels[index - 1];
                    const lineFill = previous?.completed
                        ? 100
                        : previous?.id === level.currentLevel
                            ? level.levelPercent
                            : 0;
                    return (
                        <div
                            key={step.id}
                            className={`dash-path-step ${active ? 'is-active' : ''} ${step.completed ? 'is-complete' : ''} ${step.premium ? 'is-premium' : ''}`}
                        >
                            {index > 0 && (
                                <span
                                    className={`dash-path-line ${lineFill > 0 ? 'is-progressing' : ''} ${lineFill >= 100 ? 'is-filled' : ''}`}
                                    style={{ '--dash-path-line-fill': `${lineFill}%` }}
                                    aria-hidden
                                />
                            )}
                            <span className="dash-path-dot">{step.id}</span>
                            <strong>{levelCopy(step, labels)}</strong>
                        </div>
                    );
                })}
            </div>
            <p className="dash-path-note">{streakMsg}</p>
            <p className="dash-path-current">
                {labels.currentLevelLabel.replace(
                    '{level}',
                    levelCopy(level.current, labels),
                )}
            </p>
        </article>
    );
}
