import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRealViewportHeight } from './useRealViewportHeight';

describe('useRealViewportHeight', () => {
    beforeEach(() => {
        vi.stubGlobal('requestAnimationFrame', (callback) => {
            callback();
            return 1;
        });
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 777 });
        document.documentElement.style.removeProperty('--fc-real-vh');
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('publishes the real viewport height and refreshes it on resize', () => {
        renderHook(() => useRealViewportHeight());
        expect(document.documentElement).toHaveStyle('--fc-real-vh: 777px');

        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 640 });
        window.dispatchEvent(new Event('resize'));

        expect(document.documentElement).toHaveStyle('--fc-real-vh: 640px');
    });
});
