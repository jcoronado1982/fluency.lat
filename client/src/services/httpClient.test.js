import { beforeEach, describe, expect, it, vi } from 'vitest';
import { httpClient } from './httpClient';

const jsonResponse = (payload, { ok = true, status = 200, text = '' } = {}) => ({
    ok,
    status,
    statusText: text,
    json: vi.fn().mockResolvedValue(payload),
    text: vi.fn().mockResolvedValue(text),
});

beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
});

describe('httpClient transport contract', () => {
    it('sends GET without a body and parses JSON', async () => {
        fetch.mockResolvedValue(jsonResponse({ ok: true }));

        await expect(httpClient.get('/api/demo-feedback?limit=20')).resolves.toEqual({ ok: true });
        expect(fetch).toHaveBeenCalledWith('/api/demo-feedback?limit=20', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: undefined,
        });
    });

    it('attaches JWT, serializes JSON and forwards AbortSignal', async () => {
        localStorage.setItem('auth_token', 'jwt-token');
        fetch.mockResolvedValue(jsonResponse({ success: true }));
        const controller = new AbortController();
        const body = { comment: 'Muy útil', rating: 5 };

        await httpClient.post('/api/demo-feedback', body, { signal: controller.signal });

        expect(fetch).toHaveBeenCalledWith('/api/demo-feedback', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer jwt-token',
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
    });

    it('uses DELETE with a JSON body and keeps absolute URLs intact', async () => {
        fetch.mockResolvedValue(jsonResponse({ success: true }));

        await httpClient.delete('https://api.example.test/api/delete-image', { index: 1 });

        expect(fetch).toHaveBeenCalledWith('https://api.example.test/api/delete-image', expect.objectContaining({
            method: 'DELETE',
            body: JSON.stringify({ index: 1 }),
        }));
    });

    it('uploads FormData without forcing a JSON content type', async () => {
        localStorage.setItem('auth_token', 'upload-token');
        fetch.mockResolvedValue(jsonResponse({ path: '/card_images/demo.avif' }));
        const formData = new FormData();
        formData.append('category', 'landing-demo');

        await httpClient.upload('/api/upload-image', formData, { 'X-Test': 'yes' });

        const options = fetch.mock.calls[0][1];
        expect(options.method).toBe('POST');
        expect(options.body).toBe(formData);
        expect(options.headers).toEqual({
            Authorization: 'Bearer upload-token',
            'X-Test': 'yes',
        });
        expect(options.headers['Content-Type']).toBeUndefined();
    });

    it('surfaces status and backend body for non-2xx responses', async () => {
        fetch.mockResolvedValue(jsonResponse(null, {
            ok: false,
            status: 403,
            text: 'Sesión expirada',
        }));

        await expect(httpClient.post('/api/demo-feedback', {}))
            .rejects.toThrow('HTTP 403: Sesión expirada');
    });
});
