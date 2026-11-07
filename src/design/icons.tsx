/* Иконки — единый набор вместо эмодзи. currentColor → inherits цвет текста. */
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

/** Колокольчик. Форма стилизована под «колокол» с заклёнными краями. */
export function BellIcon({ size = 20, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5Z" />
      <path d="M13.7 19a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

/** Чат: две реплики. */
export function ChatIcon({ size = 20, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M20.5 12c0 4.1-3.8 7.4-8.5 7.4a9.8 9.8 0 0 1-2.6-.35L4.5 20.5l1.1-3.2A7 7 0 0 1 3.5 12c0-4.1 3.8-7.4 8.5-7.4s8.5 3.3 8.5 7.4Z" />
    </svg>
  );
}

/** Группа людей (для группового чата). */
export function GroupIcon({ size = 20, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 19.5c0-3 2.7-5 6-5s6 2 6 5" />
      <path d="M16 5.5a3 3 0 0 1 0 5.4" />
      <path d="M18 14.8c2 .6 3.5 2.2 3.5 4.7" />
    </svg>
  );
}

export function TrashIcon({ size = 16, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M4 6.5h16M9.5 6.5V4.8c0-.7.6-1.3 1.3-1.3h2.4c.7 0 1.3.6 1.3 1.3v1.7" />
      <path d="M6.5 6.5 7.4 19a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.5" />
    </svg>
  );
}

export function PlusIcon({ size = 18, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function CheckIcon({ size = 18, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="m4.5 12.5 5 5 10-11" />
    </svg>
  );
}

export function CloseIcon({ size = 18, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

/** Солнце / луна для переключателя темы. */
export function SunIcon({ size = 20, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
    </svg>
  );
}

export function MoonIcon({ size = 20, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2Z" />
    </svg>
  );
}

/** Календарь — для тега даты на карточке. */
export function CalendarIcon({ size = 14, ...rest }: P) {
  return (
    <svg {...base(size)} strokeWidth={2} {...rest}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </svg>
  );
}

/** Значок обновления (для плашки новостей). */
export function SparkIcon({ size = 18, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5 10.1 12.8 4.5 10.9 10.1 9 12 3.5Z" />
    </svg>
  );
}

export function DownloadIcon({ size = 18, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M12 3.5v11M7.5 10.5 12 15l4.5-4.5" />
      <path d="M4.5 17.5v1.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-1.5" />
    </svg>
  );
}

/** Стрелка вниз — раскрытие подробностей в плашке новостей. Поворот на 180° = свёрнуто. */
export function ChevronIcon({ size = 18, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="m6 9.5 6 6 6-6" />
    </svg>
  );
}

/** Шестерёнка — кнопка «открыть настройки» (разрешение на установку). */
export function SettingsIcon({ size = 18, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.5v2.1M12 18.4v2.1M20.5 12h-2.1M5.6 12H3.5M18 6l-1.5 1.5M7.5 16.5 6 18M18 18l-1.5-1.5M7.5 7.5 6 6" />
    </svg>
  );
}

/** Перемешать треки. */
export function ShuffleIcon({ size = 16, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M2 16.1A4 4 0 0 1 5 10.4V6M18 14v3.8a4 4 0 0 0-.1-.2M3 15l4.6-4.3M14.1 14l4.6 4.3M17 10l-4.9 4.6" />
    </svg>
  );
}

/** Предыдущий трек. */
export function SkipBackIcon({ size = 16, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M18.7 5.4l-12 6.8c-1.1.6-1.1 2.1 0 2.8l12 6.8c1.1.6 2.6-.3 2.6-1.4v-8c0-1.1-1.5-2-2.6-1.4Z" />
    </svg>
  );
}

/** Воспроизвести (треугольник). */
export function PlayIcon({ size = 16, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M5 3L19 12L5 21V3Z" />
    </svg>
  );
}

/** Пауза (две вертикальные полоски). */
export function PauseIcon({ size = 16, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M7 4h4v16H7ZM13 4h4v16h-4Z" />
    </svg>
  );
}

/** Следующий трек. */
export function SkipForwardIcon({ size = 16, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M5.3 5.4l12 6.8c1.1.6 1.1 2.1 0 2.8l-12 6.8c-1.1.6-2.6-.3-2.6-1.4v-8c0-1.1 1.5-2 2.6-1.4Z" />
    </svg>
  );
}

/** Повтор одного трека. */
export function RepeatOneIcon({ size = 16, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M1 12c0-2.2.9-4.3 2.4-5.8L4 7v4c0 .6.4 1 1 1h4M22 12c0-2.2-.9-4.3-2.4-5.8L20 7v4c0 .6-.4 1-1 1h-4M3.9 9.8l1.3-1.3a1 1 0 0 1 1.4 0l2.1 2.1c.4.4.4 1 0 1.4l-2.1 2.1a1 1 0 0 1-1.4-1.4l1.3-1.3H2c-.6 0-1-.4-1-1v-4c0-.6.4-1 1-1h4c.6 0 1 .4 1 1v4c0 .6-.4 1-1 1Z" />
    </svg>
  );
}

/** Повтор всего плейлиста. */
export function RepeatIcon({ size = 16, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M17 2v4a3 3 0 0 0-3 3H7a4 4 0 0 0-4 4v3a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3v-3a4 4 0 0 0-4-4H7a3 3 0 0 1-3-3V2c0-1.7 1.3-3 3-3h4a3 3 0 0 1 3 3Z" />
      <path d="M13 12l3 3M16 9l3 3M13 22l3-3M16 15l3-3" />
    </svg>
  );
}

/** Меню (гамбургер). */
export function MenuIcon({ size = 16, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

/** Закрыть / крестик. */
export function XIcon({ size = 16, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

/** Внешняя ссылка (стрелка вверх-вправо). */
export function ExternalLinkIcon({ size = 16, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a2.82 2.82 0 1 0-4-4l-3 3A2.82 2.82 0 0 0 3 10.54l3 3A4 4 0 0 0 10 13Z" />
      <path d="M14 9h6M14 15h6" />
    </svg>
  );
}

/** Маркер перетаскивания (три точки по вертикали). */
export function DragHandleIcon({ size = 16, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="19" r="1" />
    </svg>
  );
}

/** Каретка вверх / вниз. */
export function ChevronUpIcon({ size = 14, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M5 12l7-7 7 7" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 14, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M19 12l-7 7-7-7" />
    </svg>
  );
}

/** Загрузка (часы / песочные часы). */
export function LoadingIcon({ size = 16, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <circle cx="12" cy="12" r="5" strokeDasharray="10 10" strokeDashoffset="2" />
    </svg>
  );
}

/** Изображение / картинка. */
export function ImageIcon({ size = 16, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="12" cy="10" r="2" />
      <path d="M8 18h8" />
    </svg>
  );
}
