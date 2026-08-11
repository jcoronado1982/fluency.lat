import { useEffect, useRef, useState } from 'react';

export default function AnimatedNumber({ value = 0, duration = 900, className = '' }) {
    const [display, setDisplay] = useState(0);
    const fromRef = useRef(0);

    useEffect(() => {
        const from = fromRef.current;
        const to = Number(value) || 0;
        let frameId;
        let startTime;

        const tick = (timestamp) => {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);
            const eased = 1 - (1 - progress) ** 3;
            setDisplay(Math.round(from + (to - from) * eased));
            if (progress < 1) {
                frameId = requestAnimationFrame(tick);
            } else {
                fromRef.current = to;
            }
        };

        frameId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frameId);
    }, [value, duration]);

    return (
        <span className={className}>
            {display.toLocaleString()}
        </span>
    );
}
