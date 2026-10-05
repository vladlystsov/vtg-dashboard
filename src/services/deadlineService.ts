import type { Track } from '../types/track';

/**
 * Напоминания по умолчанию. Дублируют DEFAULT_REMIND_OFFSETS из types/track,
 * чтобы сервис не тянул рантайм-импорт (только типы) — иначе его нельзя
 * запустить в Node без сборки. Значения должны совпадать.
 */
const DEFAULT_OFFSETS = [1, 24];

/** Срочность срока — определяет цвет тега на карточке. */
export type DueUrgency = 'overdue' | 'today' | 'soon' | 'far' | 'none';

export interface DueInfo {
  /** Дата в локальном времени. */
  date: Date;
  /** Миллисекунд до срока (отрицательное — просрочен). */
  diff: number;
  urgency: DueUrgency;
  /** Короткая подпись: «просрочено 2 д.», «сегодня», «через 3 д.». */
  label: string;
  /** Дата в формате dd.MM — компактно для карточки. */
  short: string;
}

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/**
 * Разбирает срок задачи и считает срочность.
 * `deadline` может быть как полной датой, так и «YYYY-MM-DD»
 * (как у старых пунктов чек-листа) — тогда берём конец этого дня.
 */
export function describeDue(deadline?: string | null, now: Date = new Date()): DueInfo | null {
  if (!deadline) return null;
  const raw = String(deadline).trim();
  if (!raw) return null;

  // Дата без времени: считаем сроком 23:59 этого дня.
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const date = new Date(isDateOnly ? `${raw}T23:59:00` : raw);
  if (Number.isNaN(date.getTime())) return null;

  const diff = date.getTime() - now.getTime();
  const daysLeft = Math.floor(diff / DAY);
  const hoursLeft = Math.floor(diff / HOUR);

  let urgency: DueUrgency;
  if (diff < 0) urgency = 'overdue';
  else if (daysLeft === 0) urgency = 'today';
  else if (daysLeft <= 2) urgency = 'soon';
  else urgency = 'far';

  let label: string;
  if (urgency === 'overdue') {
    const d = Math.max(1, Math.abs(daysLeft) + (Math.abs(diff) % DAY === 0 ? 0 : 1));
    label = daysLeft === 0
      ? (hoursLeft === -1 ? 'просрочено 1 ч.' : `просрочено ${Math.max(1, Math.abs(hoursLeft))} ч.`)
      : `просрочено ${d} ${plural(d, 'день', 'дня', 'дней')}`;
  } else if (urgency === 'today') {
    label = hoursLeft >= 1 ? `сегодня, ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : 'сегодня';
  } else if (urgency === 'soon') {
    label = `через ${daysLeft} ${plural(daysLeft, 'день', 'дня', 'дней')}`;
  } else {
    label = `через ${daysLeft} ${plural(daysLeft, 'день', 'дня', 'дней')}`;
  }

  return {
    date,
    diff,
    urgency,
    label,
    short: date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
  };
}

/**
 * Ближайший срок задачи: срок всей задачи, иначе — ближайший незакрытый
 * пункт чек-листа (как раньше на карточке показывалось).
 */
export function nextDueOf(track: Track, now: Date = new Date()): DueInfo | null {
  const own = describeDue(track.dueDate, now);
  if (own) return own;
  const items = (track.checklist || [])
    .filter((c) => c.deadline && c.status !== 'verified' && c.status !== 'done')
    .map((c) => describeDue(c.deadline, now))
    .filter((x): x is DueInfo => !!x)
    .sort((a, b) => a.diff - b.diff);
  return items[0] || null;
}

export interface PendingReminder {
  track: Track;
  due: DueInfo;
  /** Часов до срока, для которого сработало напоминание. */
  offsetHours: number;
  /** Ключ для защиты от повторной отправки. */
  key: string;
}

/**
 * Подбирает напоминания, которые пора отправить: срок попал в окно
 * «offsetHours ± 30 минут» (чтобы не слать при каждом запуске приложения).
 */
export function collectDueReminders(
  tracks: Track[],
  now: Date = new Date(),
  windowMs = 30 * 60 * 1000
): PendingReminder[] {
  const out: PendingReminder[] = [];
  for (const track of tracks) {
    if (track.archived) continue;
    if (track.status === 'completed' && track.column === 'released') continue;
    const due = describeDue(track.dueDate, now);
    if (!due) continue;
    const offsets = track.remindOffsets?.length ? track.remindOffsets : DEFAULT_OFFSETS;
    for (const hours of offsets) {
      const target = due.diff - hours * HOUR;
      // Попадание в окно: напоминание «пора», а не «уже прошло».
      if (target <= 0 && target > -windowMs) {
        out.push({ track, due, offsetHours: hours, key: `${track.id}:${hours}` });
        break; // на трек — одно ближайшее напоминание
      }
    }
  }
  return out;
}
