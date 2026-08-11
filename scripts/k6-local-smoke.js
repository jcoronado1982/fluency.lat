import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';

const baseUrl = __ENV.K6_BASE_URL || 'http://127.0.0.1:5173';

if (!/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/?$/.test(baseUrl)) {
    throw new Error(`k6 local rechazó una URL no local: ${baseUrl}`);
}

export const options = {
    scenarios: {
        read_paths: {
            executor: 'constant-vus',
            vus: Number(__ENV.K6_VUS || 5),
            duration: __ENV.K6_DURATION || '10s',
            exec: 'readPaths',
        },
        progress_writes: {
            executor: 'shared-iterations',
            vus: 1,
            iterations: Number(__ENV.K6_WRITE_ITERATIONS || 20),
            maxDuration: '30s',
            exec: 'progressWrites',
        },
    },
    thresholds: {
        http_req_failed: ['rate<0.01'],
        http_req_duration: ['p(95)<750'],
        checks: ['rate>0.99'],
    },
};

export function setup() {
    const guest = http.post(`${baseUrl}/api/auth/dev-guest`);
    check(guest, { 'dev-guest responde 200': (response) => response.status === 200 });
    if (guest.status !== 200) throw new Error(`dev-guest falló: ${guest.status}`);
    const auth = guest.json();
    const headers = { Authorization: `Bearer ${auth.token}` };
    const categories = http.get(`${baseUrl}/api/categories?course_direction=es_en&include_counts=true`, { headers });
    const category = categories.json('categories.0.name');
    const decks = http.get(`${baseUrl}/api/available-flashcards-files?course_direction=es_en&category=${encodeURIComponent(category)}`, { headers });
    const deck = decks.json('files.0');
    if (!category || !deck) throw new Error('catálogo local vacío para k6');
    return { token: auth.token, userId: auth.user.email, category, deck };
}

const requestParams = (data) => ({
    headers: {
        Authorization: `Bearer ${data.token}`,
        'Content-Type': 'application/json',
    },
});

export function readPaths(data) {
    const params = requestParams(data);
    const query = `user_id=${encodeURIComponent(data.userId)}&category=${encodeURIComponent(data.category)}&deck=${encodeURIComponent(data.deck)}&course_direction=es_en`;
    const responses = http.batch([
        ['GET', `${baseUrl}/api/health`],
        ['GET', `${baseUrl}/api/features`],
        ['GET', `${baseUrl}/api/categories?course_direction=es_en&include_counts=true`, null, params],
        ['GET', `${baseUrl}/api/available-flashcards-files?course_direction=es_en&category=${encodeURIComponent(data.category)}`, null, params],
        ['GET', `${baseUrl}/api/flashcards-data?${query}`, null, params],
        ['GET', `${baseUrl}/api/learning-stats?course_direction=es_en`, null, params],
    ]);

    check(responses[0], {
        'health responde 200': (response) => response.status === 200,
        'health informa ok': (response) => response.json('status') === 'ok',
    });
    check(responses[1], {
        'features responde 200': (response) => response.status === 200,
        'flashcards está activo': (response) => response.json('flashcards') === true,
    });
    check(responses[2], { 'categorías responden': (response) => response.status === 200 && response.json('categories.0.name') !== undefined });
    check(responses[3], { 'decks responden': (response) => response.status === 200 && response.json('files.0') !== undefined });
    check(responses[4], { 'mazo responde': (response) => response.status === 200 && Array.isArray(response.json()) });
    check(responses[5], { 'estadísticas responden': (response) => response.status === 200 && response.json('success') === true });
}

export function progressWrites(data) {
    const learned = exec.scenario.iterationInTest % 2 === 0;
    const response = http.post(`${baseUrl}/api/update-batch`, JSON.stringify({
        user_id: data.userId,
        category: data.category,
        deck: data.deck,
        course_direction: 'es_en',
        cards: [{ index: 0, learned }],
    }), requestParams(data));
    check(response, {
        'lote de progreso persiste': (item) => item.status === 200 && item.json('saved') === 1,
    });
}

export function teardown(data) {
    const response = http.post(`${baseUrl}/api/reset-all`, JSON.stringify({
        user_id: data.userId,
        category: data.category,
        deck: data.deck,
        course_direction: 'es_en',
        confirm: true,
    }), requestParams(data));
    check(response, { 'progreso k6 restaurado': (item) => item.status === 200 });
}
