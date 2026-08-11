import assert from 'node:assert/strict';
import {
  computeLevelProgress,
  computeDashboardLevelProgress,
  formatCategoryLabel,
  formatDeckLabel,
  getStreakMessage,
  getTimeGreeting,
  estimateMinutesRemaining,
  getDashboardQuickAccessItems,
  getDashboardCarouselItems,
} from '../src/modules/dashboard/useCases/dashboardProgress.js';

// --- computeLevelProgress (fallback sin stats.levels del backend) ---
{
  const progress = computeLevelProgress(0, 'en');
  assert.equal(progress.currentLevel, 'A1');
  assert.equal(progress.levelPercent, 0);
}
{
  // 700 palabras = justo el límite de A1 (max: 700) -> ya cruzó a A2.
  const progress = computeLevelProgress(700, 'en');
  assert.equal(progress.currentLevel, 'A2');
}
{
  const progress = computeLevelProgress(10_000, 'en');
  assert.equal(progress.currentLevel, 'B2');
  assert.equal(progress.isMaxLevel, true);
}

// --- computeDashboardLevelProgress (con stats.levels reales del backend) ---
{
  const stats = {
    current_level: 'A2',
    level_percent: 40,
    levels: [
      { level: 'A1', mastered_count: 10, target_count: 10, cumulative_mastered: 10, cumulative_target: 10, completed: true, premium: false },
      { level: 'A2', mastered_count: 4, target_count: 10, cumulative_mastered: 14, cumulative_target: 20, completed: false, premium: false },
      { level: 'B1', mastered_count: 0, target_count: 10, cumulative_mastered: 14, cumulative_target: 30, completed: false, premium: false },
      { level: 'B2', mastered_count: 0, target_count: 2470, cumulative_mastered: 14, cumulative_target: 2500, completed: false, premium: true },
    ],
    decks_progress: [
      { deck: '1-basic/action.json', total_count: 10 },
      { deck: '2-intermediate/action.json', total_count: 10 },
      { deck: '2-intermediate/other.json', total_count: 5 },
    ],
  };
  const progress = computeDashboardLevelProgress(stats, 'en');
  assert.equal(progress.currentLevel, 'A2');
  assert.equal(progress.levelPercent, 40);
  // targetForLevel debe sumar las tarjetas REALES de decks_progress que
  // empiezan con el prefijo del nivel actual (2-intermediate/), no el
  // target de palabras del backend (10): 10 + 5 = 15.
  assert.equal(progress.targetForLevel, 15);
  assert.equal(progress.wordsInLevel, 4);
  assert.equal(progress.isMaxFreeLevel, false);
}
{
  // Sin decks_progress que matcheen el prefijo del nivel actual: cae al
  // fallback (el target de palabras del backend).
  const stats = {
    current_level: 'A1',
    levels: [
      { level: 'A1', mastered_count: 0, target_count: 10, cumulative_mastered: 0, cumulative_target: 10, completed: false, premium: false },
    ],
    decks_progress: [],
  };
  const progress = computeDashboardLevelProgress(stats, 'en');
  assert.equal(progress.targetForLevel, 10);
}
{
  // B1 completo y sin next -> isMaxFreeLevel según la definición del nivel
  // actual, no de B1 explícito por id fijo (current.id === 'B1' && completed).
  const stats = {
    current_level: 'B1',
    levels: [
      { level: 'A1', mastered_count: 10, target_count: 10, cumulative_mastered: 10, cumulative_target: 10, completed: true, premium: false },
      { level: 'A2', mastered_count: 10, target_count: 10, cumulative_mastered: 20, cumulative_target: 20, completed: true, premium: false },
      { level: 'B1', mastered_count: 10, target_count: 10, cumulative_mastered: 30, cumulative_target: 30, completed: true, premium: false },
    ],
    decks_progress: [],
  };
  const progress = computeDashboardLevelProgress(stats, 'en');
  assert.equal(progress.currentLevel, 'B1');
  assert.equal(progress.isMaxFreeLevel, true);
  assert.equal(progress.next, null);
}

// --- formatCategoryLabel / formatDeckLabel ---
assert.equal(formatCategoryLabel('verbs', 'es'), 'Verbos');
assert.equal(formatCategoryLabel('verbs', 'en'), 'Verbs');
assert.equal(formatCategoryLabel('unknown_category', 'en'), 'Unknown Category');
assert.equal(formatCategoryLabel('', 'es'), '');

assert.equal(formatDeckLabel('Phrasal Verbs: Get', 'es'), 'Verbos frasales: Get');
assert.equal(formatDeckLabel('Phrasal Verbs: Get', 'en'), 'Phrasal Verbs: Get');
assert.equal(formatDeckLabel('Subject', 'es'), 'Sujeto'); // traducción conocida en DECK_LABEL_TRANSLATIONS_ES
assert.equal(formatDeckLabel('Zzz Unmapped Deck', 'es'), 'Zzz Unmapped Deck'); // sin traducción -> pasa igual

// --- getStreakMessage ---
{
  const labels = {
    streakConsecutiveDay: '1 día seguido',
    streakConsecutiveDays: '{n} días seguidos',
    streakStudiedToday: 'Estudiaste hoy',
    streakAtRisk: 'Racha en riesgo',
    streakMissedDay: 'Faltaste 1 día',
    streakMissedDays: 'Faltaste {n} días',
    streakComeBack: 'Vuelve a estudiar',
    streakStartShort: 'Empieza tu racha',
    streakKeepLearning: 'Sigue así',
  };
  assert.equal(
    getStreakMessage({ studied_today: true, streak_days: 5 }, labels),
    '5 días seguidos',
  );
  assert.equal(
    getStreakMessage({ studied_today: true, streak_days: 1 }, labels),
    '1 día seguido',
  );
  assert.equal(
    getStreakMessage({ streak_at_risk: true, streak_days: 3 }, labels),
    '3 días seguidos',
  );
  assert.equal(
    getStreakMessage({ days_since_last_study: 4 }, labels),
    'Faltaste 4 días',
  );
  assert.equal(
    getStreakMessage({ days_since_last_study: 1 }, labels),
    'Faltaste 1 día',
  );
  assert.equal(getStreakMessage({}, labels), 'Empieza tu racha');
}

// --- getTimeGreeting: no controlamos la hora real, solo la forma del resultado ---
{
  const greeting = getTimeGreeting('en', 'Ana');
  assert.ok(greeting.endsWith(', Ana'));
  assert.ok(/^Good (morning|afternoon|evening), Ana$/.test(greeting));
  assert.equal(getTimeGreeting('en', null).includes(','), false);
}

// --- estimateMinutesRemaining ---
assert.equal(estimateMinutesRemaining(0), 0);
assert.equal(estimateMinutesRemaining(-5), 0);
assert.equal(estimateMinutesRemaining(1), 1); // redondea hacia arriba, mínimo 1
assert.equal(estimateMinutesRemaining(120), 60); // 120 tarjetas * 30s = 3600s = 60min

// --- getDashboardQuickAccessItems: prioriza "en progreso", excluye la actual ---
{
  const stats = {
    decks_progress: [
      { category: 'verbs', deck: '1-basic/action.json', learned_count: 3, total_count: 10, last_touched: '2026-01-05T00:00:00Z' },
      { category: 'nouns', deck: '1-basic/food.json', learned_count: 1, total_count: 10, last_touched: '2026-01-03T00:00:00Z' },
      { category: 'adjectives', deck: '1-basic/colors.json', learned_count: 10, total_count: 10, last_touched: '2026-01-01T00:00:00Z' },
    ],
  };
  const items = getDashboardQuickAccessItems({
    levelId: 'A1',
    currentCategory: 'verbs',
    currentDeck: '1-basic/action.json',
    language: 'en',
    limit: 3,
    stats,
  });
  // La tarjeta activa (verbs/1-basic/action) nunca debe aparecer en las sugerencias.
  assert.ok(!items.some((item) => item.category === 'verbs' && item.deckName === '1-basic/action.json'));
  // "nouns" está en progreso (1/10) y debe aparecer antes que "adjectives" (completo).
  const nounsIndex = items.findIndex((item) => item.category === 'nouns');
  const adjectivesIndex = items.findIndex((item) => item.category === 'adjectives');
  assert.ok(nounsIndex !== -1);
  if (adjectivesIndex !== -1) {
    assert.ok(nounsIndex < adjectivesIndex);
  }
}

// --- getDashboardCarouselItems: la sesión activa siempre va primero ---
{
  const stats = {
    decks_progress: [
      { category: 'verbs', deck: '1-basic/action.json', learned_count: 3, total_count: 10, last_touched: '2026-01-05T00:00:00Z' },
    ],
  };
  const items = getDashboardCarouselItems({
    levelId: 'A1',
    currentCategory: 'verbs',
    currentSession: { category: 'verbs', deck: '1-basic/action.json', cardsRemaining: 7 },
    language: 'en',
    stats,
  });
  assert.equal(items[0].isCurrentGoal, true);
  assert.equal(items[0].category, 'verbs');
  assert.equal(items[0].cardsRemaining, 7);
  // La sesión activa no debe duplicarse como entrada de categoría normal.
  assert.equal(items.filter((item) => item.category === 'verbs').length, 1);
}

console.log('✅ test-dashboard-progress: todos los asserts pasaron');
