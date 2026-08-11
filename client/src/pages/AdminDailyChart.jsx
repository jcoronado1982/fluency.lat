import React, { useState } from 'react';

const CHART_WIDTH = 600;
const CHART_HEIGHT = 130;
const PADDING = { top: 14, right: 10, bottom: 8, left: 10 };

function formatChartDate(dateStr) {
    const [, month, day] = dateStr.split('-');
    return new Date(2000, Number(month) - 1, Number(day)).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
    });
}

/**
 * Serie temporal de una sola métrica (sin leyenda: el título la identifica).
 * Sin librería de gráficos: SVG plano, línea de 2px, marcador de hover >=8px.
 */
export default function AdminDailyChart({ title, points, color }) {
    const [hoverIndex, setHoverIndex] = useState(null);

    const innerW = CHART_WIDTH - PADDING.left - PADDING.right;
    const innerH = CHART_HEIGHT - PADDING.top - PADDING.bottom;
    const maxValue = Math.max(1, ...points.map((p) => p.value));

    const coords = points.map((p, i) => {
        const x = PADDING.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
        const y = PADDING.top + innerH - (p.value / maxValue) * innerH;
        return { ...p, x, y };
    });

    const pathD = coords.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const hovered = hoverIndex !== null ? coords[hoverIndex] : null;
    const latest = coords[coords.length - 1] || null;

    const handleMove = (e) => {
        if (coords.length === 0) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const relX = ((e.clientX - rect.left) / rect.width) * CHART_WIDTH;
        let nearest = 0;
        let minDist = Infinity;
        coords.forEach((p, i) => {
            const dist = Math.abs(p.x - relX);
            if (dist < minDist) {
                minDist = dist;
                nearest = i;
            }
        });
        setHoverIndex(nearest);
    };

    return (
        <div className="admin-chart-card">
            <div className="admin-chart-header">
                <h3 className="admin-chart-title">{title}</h3>
                {latest && <span className="admin-chart-headline">{latest.value}</span>}
            </div>
            <div className="admin-chart-plot">
                <svg
                    viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                    className="admin-chart-svg"
                    preserveAspectRatio="none"
                    onMouseMove={handleMove}
                    onMouseLeave={() => setHoverIndex(null)}
                    role="img"
                    aria-label={title}
                >
                    <line
                        x1={PADDING.left}
                        y1={PADDING.top + innerH}
                        x2={CHART_WIDTH - PADDING.right}
                        y2={PADDING.top + innerH}
                        className="admin-chart-baseline"
                    />
                    {coords.length > 1 && (
                        <path d={pathD} className="admin-chart-line" style={{ stroke: color }} fill="none" />
                    )}
                    {hovered && (
                        <>
                            <line
                                x1={hovered.x}
                                y1={PADDING.top}
                                x2={hovered.x}
                                y2={PADDING.top + innerH}
                                className="admin-chart-crosshair"
                            />
                            <circle cx={hovered.x} cy={hovered.y} r={4.5} style={{ fill: color }} />
                        </>
                    )}
                </svg>
                {hovered && (
                    <div
                        className="admin-chart-tooltip"
                        style={{ left: `${(hovered.x / CHART_WIDTH) * 100}%` }}
                    >
                        <span className="admin-chart-tooltip-date">{formatChartDate(hovered.date)}</span>
                        <span className="admin-chart-tooltip-value">{hovered.value}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
