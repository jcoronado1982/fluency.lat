import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

const createStorageMock = () => {
    let store = {};
    return {
        getItem: (key) => store[key] ?? null,
        setItem: (key, value) => {
            store[key] = String(value);
        },
        removeItem: (key) => {
            delete store[key];
        },
        clear: () => {
            store = {};
        },
        get length() {
            return Object.keys(store).length;
        },
        key: (index) => Object.keys(store)[index] ?? null,
    };
};

const storageMock = createStorageMock();
Object.defineProperty(globalThis, 'localStorage', {
    value: storageMock,
    writable: true,
});
if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
        value: storageMock,
        writable: true,
    });
}

afterEach(cleanup);

