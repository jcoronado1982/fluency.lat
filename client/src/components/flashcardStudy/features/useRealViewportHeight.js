import { useEffect } from 'react';

/**
 * Bajo escalado fraccional del sistema operativo (p.ej. 150% en Linux/GTK),
 * algunos navegadores calculan mal `100dvh` frente al alto real del viewport
 * (window.innerHeight) — la tarjeta queda fija en su alto máximo aunque el
 * espacio real disponible sea mucho menor. Este hook mide el alto real vía
 * JS y lo expone como --fc-real-vh en :root para que App.css/Flashcard.module.css
 * lo usen en vez de depender solo de la unidad dvh.
 */
export function useRealViewportHeight() {
    useEffect(() => {
        const root = document.documentElement;
        let frame = null;

        const update = () => {
            root.style.setProperty('--fc-real-vh', `${window.innerHeight}px`);
        };

        const scheduleUpdate = () => {
            if (frame) cancelAnimationFrame(frame);
            frame = requestAnimationFrame(update);
        };

        update();
        window.addEventListener('resize', scheduleUpdate);
        window.addEventListener('orientationchange', scheduleUpdate);
        window.visualViewport?.addEventListener('resize', scheduleUpdate);

        return () => {
            if (frame) cancelAnimationFrame(frame);
            window.removeEventListener('resize', scheduleUpdate);
            window.removeEventListener('orientationchange', scheduleUpdate);
            window.visualViewport?.removeEventListener('resize', scheduleUpdate);
        };
    }, []);
}
