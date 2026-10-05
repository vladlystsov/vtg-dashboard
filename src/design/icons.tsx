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
