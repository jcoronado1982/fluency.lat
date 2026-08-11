import { useCallback, useEffect, useRef, useState } from 'react';

function easeToward(current, target, step = 0.4) {
    if (current >= target) return current;
    return Math.min(current + step, target);
}

export function usePageLoader() {
    const [progress, setProgress] = useState(0);
    const [currentTask, setCurrentTask] = useState('');
    const [done, setDone] = useState(false);
    const accumulated = useRef(0);
    const frameRef = useRef(null);

    const animateTo = useCallback((target) => {
        if (frameRef.current) cancelAnimationFrame(frameRef.current);

        const step = () => {
            setProgress((prev) => {
                const next = easeToward(prev, target);
                if (next < target) {
                    frameRef.current = requestAnimationFrame(step);
                }
                return Math.round(next * 10) / 10;
            });
        };

        frameRef.current = requestAnimationFrame(step);
    }, []);

    const reset = useCallback(() => {
        accumulated.current = 0;
        setProgress(0);
        setCurrentTask('');
        setDone(false);
    }, []);

    const finish = useCallback(() => {
        animateTo(100);
        window.setTimeout(() => setDone(true), 300);
    }, [animateTo]);

    const run = useCallback(async (tasks) => {
        reset();
        const total = tasks.reduce((acc, t) => acc + (t.weight ?? 1), 0);
        const results = new Array(tasks.length);

        await Promise.all(tasks.map(async (task, index) => {
            setCurrentTask(task.label ?? 'Loading...');
            try {
                results[index] = await task.fn();
            } finally {
                accumulated.current += (task.weight ?? 1);
                animateTo((accumulated.current / total) * 100);
                setCurrentTask('');
            }
        }));

        finish();
        return results;
    }, [animateTo, finish, reset]);

    useEffect(() => () => {
        if (frameRef.current) cancelAnimationFrame(frameRef.current);
    }, []);

    return { progress, currentTask, done, run, reset, setProgress, setCurrentTask, animateTo, finish };
}
