import type { PlatformKind } from './track';

export type BeatStatus = 'published' | 'hidden';

export type BeatUploadStatus = 'uploading' | 'ready' | 'error';

export interface Beat {
  id: string;
  title: string;
  bpm?: number | null;
  key?: string;
  genre?: string;
  tags?: string[];
  description?: string;
  coverUrl?: string;
  platformUrl?: string;
  platform?: PlatformKind;
  beatmakerUid: string;
  beatmakerName: string;
  // Артисты бита (основные) — имена и uid команды, если применимо
  artists?: string[];
  artistUids?: string[];
  status: BeatStatus;
  free?: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  // Карточка создаётся сразу, публикация mp3 идёт в фоне
  uploadStatus?: BeatUploadStatus;
  uploadError?: string;
  // Сборник (коллекция), в которую входит бит
  collection?: string;
  collectionNumber?: number;
}

export const BEAT_STATUS_LABELS: Record<BeatStatus, string> = {
  published: 'Опубликован',
  hidden: 'Скрыт',
};

const KEY_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export const BEAT_KEY_OPTIONS: string[] = KEY_ROOTS.flatMap((r) => [r, `${r}m`]);

export const BEAT_GENRE_OPTIONS = [
  'Hip-Hop',
  'Trap',
  'Drill',
  'Pop',
  'R&B',
  'Afrobeat',
  'Boom Bap',
  'Lo-Fi',
  'Synthwave',
  'Phonk',
  'House',
  'Techno',
];

export type BeatFormData = {
  title: string;
  bpm?: number | null;
  key?: string;
  genre?: string;
  tags?: string[];
  description?: string;
  coverUrl?: string;
  platformUrl?: string;
  platform?: PlatformKind;
  artists?: string[];
  artistUids?: string[];
  status: BeatStatus;
  free?: boolean;
  beatmakerUid: string;
  beatmakerName: string;
  createdBy: string;
  uploadStatus?: BeatUploadStatus;
  collection?: string;
  collectionNumber?: number;
};