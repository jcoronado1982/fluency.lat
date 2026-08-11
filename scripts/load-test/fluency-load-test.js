import http from 'k6/http';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const BASE = __ENV.TARGET_BASE || 'https://fluency.lat';
const PROFILE = __ENV.PROFILE || 'json';
const MAX_VUS = parseInt(__ENV.MAX_VUS || '100', 10);
const STAGE_SEC = parseInt(__ENV.STAGE_SEC || '30', 10);
const SUMMARY_OUT = __ENV.SUMMARY_OUT || '';

const DECKS = [
  '/json/es_en/verbs/1-basic/action.json',
  '/json/es_en/nouns/1-basic/animals.json',
  '/json/en_es/verbs/1-basic/action.json',
  '/json/es_de/verbs/1-basic/action.json',
];

const overflowHits = new Counter('overflow_responses');
const localHits = new Counter('local_responses');
const jsonLatency = new Trend('json_duration', true);
const apiLatency = new Trend('api_duration', true);
const dbLatency = new Trend('db_duration', true);

function buildStages() {
  const steps = [5, 10, 25, 50, 100, 200, 400].filter((v) => v <= MAX_VUS);
  if (steps.length === 0) steps.push(MAX_VUS);
  if (steps[steps.length - 1] !== MAX_VUS) steps.push(MAX_VUS);

  const stages = [];
  for (const target of steps) {
    stages.push({ duration: '5s', target });
    stages.push({ duration: `${STAGE_SEC}s`, target });
  }
  stages.push({ duration: '10s', target: 0 });
  return stages;
}

export const options = {
  stages: buildStages(),
  thresholds: {
    http_req_failed: [
      { threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '10s' },
    ],
    'http_req_duration{expected_response:true}': [
      { threshold: 'p(95)<3000', abortOnFail: true, delayAbortEval: '15s' },
    ],
  },
  noConnectionReuse: false,
  discardResponseBodies: false,
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

function hitJson() {
  const url = BASE + DECKS[Math.floor(Math.random() * DECKS.length)];
  const res = http.get(url, {
    headers: { 'Accept-Encoding': 'gzip, zstd' },
    tags: { kind: 'json' },
  });
  jsonLatency.add(res.timings.duration);
  check(res, {
    'json 200': (r) => r.status === 200,
    'json no vacio': (r) => !!r.body && r.body.length > 1000,
  });
  return res;
}

function hitApi() {
  const res = http.get(BASE + '/api/health', { tags: { kind: 'api' } });
  apiLatency.add(res.timings.duration);
  check(res, { 'api 200': (r) => r.status === 200 });

  const backend = res.headers['X-Backend'] || res.headers['x-backend'];
  if (backend) {
    if (backend.indexOf('CloudRun') !== -1) overflowHits.add(1);
    else localHits.add(1);
  }
  return res;
}

function hitDbWrite() {
  const payload = JSON.stringify({ tag: 'k6_db_write' });
  const params = {
    headers: { 'Content-Type': 'application/json' },
    tags: { kind: 'db_write' },
  };
  const res = http.post(BASE + '/api/benchmark/db-cycle', payload, params);
  dbLatency.add(res.timings.duration);
  check(res, { 'db 200': (r) => r.status === 200 });

  const backend = res.headers['X-Backend'] || res.headers['x-backend'];
  if (backend) {
    if (backend.indexOf('CloudRun') !== -1) overflowHits.add(1);
    else localHits.add(1);
  }
  return res;
}

export default function () {
  if (PROFILE === 'json') {
    hitJson();
  } else if (PROFILE === 'api') {
    hitApi();
  } else if (PROFILE === 'db_write') {
    hitDbWrite();
  } else {
    const r = Math.random();
    if (r < 0.70) hitJson();
    else if (r < 0.85) hitApi();
    else hitDbWrite();
  }
}

export function handleSummary(data) {
  const out = {};
  out[SUMMARY_OUT || 'k6-summary.json'] = JSON.stringify(data, null, 2);

  const m = data.metrics;
  const g = (name, stat) => (m[name] && m[name].values ? m[name].values[stat] : null);
  const fmt = (v) => (v === null || v === undefined ? 'n/a' : Math.round(v * 100) / 100);

  const lines = [
    '',
    '───────────── RESUMEN k6 ─────────────',
    `perfil=${PROFILE}  target=${BASE}  max_vus=${MAX_VUS}`,
    `requests           : ${fmt(g('http_reqs', 'count'))} (${fmt(g('http_reqs', 'rate'))}/s)`,
    `fallidas           : ${fmt(g('http_req_failed', 'rate') * 100)}%`,
    `latencia med       : ${fmt(g('http_req_duration', 'med'))} ms`,
    `latencia p95       : ${fmt(g('http_req_duration', 'p(95)'))} ms`,
    `latencia p99       : ${fmt(g('http_req_duration', 'p(99)'))} ms`,
    `latencia max       : ${fmt(g('http_req_duration', 'max'))} ms`,
    `json p95           : ${fmt(g('json_duration', 'p(95)'))} ms`,
    `api  p95           : ${fmt(g('api_duration', 'p(95)'))} ms`,
    `db   p95           : ${fmt(g('db_duration', 'p(95)'))} ms`,
    `respuestas local   : ${fmt(g('local_responses', 'count'))}`,
    `respuestas overflow: ${fmt(g('overflow_responses', 'count'))}  ← >0 significa que la válvula se activó`,
    '──────────────────────────────────────',
    '',
  ];
  out.stdout = lines.join('\n');
  return out;
}
