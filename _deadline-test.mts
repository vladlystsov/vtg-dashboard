/**
 * Проверка логики сроков и напоминаний (Фаза 2).
 * Запуск: node --experimental-strip-types _deadline-test.mts
 * deadlineService импортирует только типы (import type), поэтому type
 * stripping достаточно — рантайм-импортов у него нет.
 */
import { describeDue, nextDueOf, collectDueReminders } from './src/services/deadlineService.ts';
import type { Track } from './src/types/track.ts';

const now = new Date('2026-10-18T12:00:00Z');
const H = 3600_000;
const D = 24 * H;
let failed = 0;

/** Срок через N часов от now — важно в ISO, а не локальное время,
    иначе на машине с не-UTC зоной расчёт уедет на несколько часов. */
const inHours = (h: number) => new Date(now.getTime() + h * H).toISOString();

function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failed++;
    console.log(`FAIL ${name}\n  ожидалось: ${JSON.stringify(expected)}\n  получено: ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok   ${name} → ${JSON.stringify(actual)}`);
  }
}

// --- describeDue ---
check('просрочен на 2 дня', describeDue(inHours(-2 * 24), now)?.urgency, 'overdue');
check('подпись просрочки', describeDue(inHours(-2 * 24), now)?.label, 'просрочено 2 дня');
check('просрочен на 5 дней (склонение)', describeDue(inHours(-5 * 24), now)?.label, 'просрочено 5 дней');
check('сегодня', describeDue(inHours(3), now)?.urgency, 'today');
check('через 1 день → soon', describeDue(inHours(24), now)?.urgency, 'soon');
check('через 5 дней → far', describeDue(inHours(5 * 24), now)?.urgency, 'far');
check('мусор → null', describeDue('не дата', now), null);
check('short = dd.MM', describeDue('2026-11-05', now)?.short, '05.11');
// Дата без времени трактуется как конец дня — 23:59
check(
  'дата без времени = конец дня',
  describeDue('2026-10-18', new Date('2026-10-18T09:00:00Z'))?.urgency,
  'today'
);
check('пустая дата → null', describeDue('', now), null);

// --- nextDueOf: приоритет срока задачи над пунктами чек-листа ---
const track = (over: Partial<Track>): Track => ({
  id: 't1', title: 'x', artists: [], artistUids: [], beatmakers: [], beatmakerUids: [],
  mixBy: [], mixByUids: [], feat: '', project: '', status: 'draft', column: 'ideas',
  checklist: [], createdAt: '', updatedAt: '', createdBy: '', priority: 'medium',
  ...over,
});

check(
  'срок задачи важнее чек-листа',
  // Через 2 дня = soon; важно, что взят срок задачи (2 дня), а не ближайший
  // пункт чек-листа (через 5 часов = today).
  nextDueOf(track({
    dueDate: inHours(2 * 24),
    checklist: [{ id: 'c1', label: 'Бит', status: 'pending', deadline: inHours(5) }],
  }), now)?.urgency,
  'soon'
);
check(
  'если срока задачи нет — берём ближайший пункт',
  nextDueOf(track({
    checklist: [
      { id: 'c1', label: 'Бит', status: 'pending', deadline: inHours(9 * 24) },
      { id: 'c2', label: 'Микс', status: 'pending', deadline: inHours(2) },
      { id: 'c3', label: 'Релиз', status: 'verified', deadline: inHours(1) },
    ],
  }), now)?.urgency,
  'today'
);
check('без сроков → null', nextDueOf(track({}), now), null);

// --- collectDueReminders ---
const withDue = (id: string, hours: number, offsets?: number[], extra: Partial<Track> = {}) =>
  track({ id, dueDate: inHours(hours), remindOffsets: offsets, ...extra });

check(
  'за 1 час — сработало',
  collectDueReminders([withDue('a', 0.9, [1])], now).map((r) => r.key),
  ['a:1']
);
check(
  'за 24 ч — сработало',
  collectDueReminders([withDue('b', 23.7, [24])], now).map((r) => r.key),
  ['b:24']
);
check(
  'слишком рано — не сработало',
  collectDueReminders([withDue('c', 5, [1])], now).map((r) => r.key),
  []
);
check(
  'уже поздно (минус час) — не сработало',
  collectDueReminders([withDue('d', -1, [1])], now).map((r) => r.key),
  []
);
check(
  'на одно напоминание на трек',
  collectDueReminders([withDue('e', 0.9, [1, 24, 48, 72])], now).map((r) => r.offsetHours),
  [1]
);
check(
  'без явных настроек — дефолт (час, день)',
  collectDueReminders([withDue('f', 0.9, undefined)], now).map((r) => r.offsetHours),
  [1]
);
check('архивные пропускаются', collectDueReminders([withDue('g', 0.9, [1], { archived: true })], now).length, 0);
check(
  'завершённые пропускаются',
  collectDueReminders([withDue('h', 0.9, [1], { status: 'completed', column: 'released' })], now).length,
  0
);
check('без dueDate пропускаются', collectDueReminders([track({ id: 'i' })], now).length, 0);

console.log(failed === 0 ? '\nВсе проверки пройдены' : `\nПровалено: ${failed}`);
if (failed) process.exit(1);
