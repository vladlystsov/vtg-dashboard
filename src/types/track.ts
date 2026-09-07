export type TrackStatus = 'draft' | 'recording' | 'mixing' | 'mastering' | 'ready' | 'completed';

export type KanbanColumn = 'ideas' | 'in_progress' | 'review' | 'ready_to_publish' | 'released';

// Статус "версии" проекта: основной или другая версия
export type ProjectVariant = 'main' | 'other';

// Тип вокала/материала для версии проекта
export type ProjectVocalType =
  | 'loop'
  | 'beat'
  | 'first_vocal'
  | 'part_vocal'
  | 'full_vocal'
  | 'mixed'
  | 'mastered';

export const PROJECT_VARIANT_LABELS: Record<ProjectVariant, string> = {
  main: 'Основной',
  other: 'Другая версия',
};

export const PROJECT_VOCAL_TYPE_LABELS: Record<ProjectVocalType, string> = {
  loop: 'Луп',
  beat: 'Бит',
  first_vocal: 'First vocal',
  part_vocal: 'Part vocal',
  full_vocal: 'Full vocal',
  mixed: 'Сведено',
  mastered: 'Отмастерено',
};

export const PROJECT_VOCAL_TYPES: ProjectVocalType[] = [
  'loop',
  'beat',
  'first_vocal',
  'part_vocal',
  'full_vocal',
  'mixed',
  'mastered',
];

// Этап конвейера для версии проекта (звукорежиссёр)
export type ProjectStage = 'mixing' | 'review' | 'mastering' | 'ready';

export const PROJECT_STAGE_LABELS: Record<ProjectStage, string> = {
  mixing: 'Сведение',
  review: 'На проверке',
  mastering: 'Мастеринг',
  ready: 'Готово',
};

export const PROJECT_STAGES: ProjectStage[] = ['mixing', 'review', 'mastering', 'ready'];

// DAW, в котором собрана версия проекта
export type ProjectDaw = 'fl' | 'trackout' | 'other';

export const PROJECT_DAW_LABELS: Record<ProjectDaw, string> = {
  fl: 'FL Studio',
  trackout: 'Трекаут',
  other: 'Другое',
};

export const PROJECT_DAWS: ProjectDaw[] = ['fl', 'trackout', 'other'];

export type ChecklistStatus = 'pending' | 'in_progress' | 'done' | 'review' | 'verified';

export type UserRole = 'member' | 'admin' | 'owner';

export type ArtistRole = 'artist' | 'beatmaker' | 'mixer' | 'feat';

export type ReleaseType = 'single' | 'ep' | 'album' | 'auto';

// Состояние фоновой публикации прямого mp3 в Archive.org
export type TrackArchiveStatus = 'uploading' | 'ready' | 'error';

export const RELEASE_TYPE_LABELS: Record<Exclude<ReleaseType, 'auto'>, string> = {
  single: 'Сингл',
  ep: 'EP',
  album: 'Альбом',
};

export function autoDetectReleaseType(trackCount: number): Exclude<ReleaseType, 'auto'> {
  if (trackCount <= 3) return 'single';
  if (trackCount <= 7) return 'ep';
  return 'album';
}

export type PlaybackMode = 'platform' | 'local';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  avatarUrl?: string;
  artistName?: string;
  isArtist?: boolean;
  artistVerified?: boolean;
  roles?: ArtistRole[];
  playbackMode?: PlaybackMode;
  downloadTracks?: boolean;
  youtubeUrl?: string;
  soundcloudUrl?: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  status: ChecklistStatus;
  assignee?: string;
  deadline?: string;
  comment?: string;
  fileUrl?: string;
  fileName?: string;
}

export interface Track {
  id: string;
  title: string;
  artists: string[];
  artistUids: string[];
  beatmakers: string[];
  beatmakerUids: string[];
  mixBy: string[];
  mixByUids: string[];
  feat: string;
  artistsString?: string;
  beatmakerString?: string;
  project: string;
  trackNumber?: number;
  coverUrl?: string;
  status: TrackStatus;
  column: KanbanColumn;
  checklist: ChecklistItem[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  priority: 'low' | 'medium' | 'high';
  releaseType?: ReleaseType;
  albumBeatmakers?: string[] | string;
  albumMixBy?: string[] | string;
  platformUrl?: string;
  archiveStatus?: TrackArchiveStatus;
  archiveError?: string;
  // Проект (zip) — архив с проектом трека, загружается через Archive.org
  projectZipUrl?: string;
  projectZipStatus?: TrackArchiveStatus;
  projectZipError?: string;
  projectVariant?: ProjectVariant;
  projectVocalType?: ProjectVocalType;
  // DAW, в котором сделан проект трека
  projectDaw?: ProjectDaw;
  projectDawVersion?: string;
  // Персональная обложка трека в альбоме (если отличается от обложки альбома)
  personalCoverUrl?: string;
  // Список загруженных на Archive.org проектов (.zip), привязанных к этому треку
  projectZips?: TrackProjectZip[];
  // Архив доски (пункт «Поместить в архив»)
  archived?: boolean;
}

export interface TrackProjectZip {
  projectId: string;
  projectName: string;
  zipUrl?: string;
  zipStatus?: TrackArchiveStatus;
  zipError?: string;
  uploadedAt: string;
}

export interface Project {
  id: string;
  name: string;
  tracks?: string[];
  zipUrl?: string;
  zipStatus?: TrackArchiveStatus;
  zipError?: string;
  variants?: Record<string, { variant?: ProjectVariant; vocalType?: ProjectVocalType }>;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
// Сопутствующая информация проекта (задаётся в окне создания/редактирования)
  description?: string;
  coverUrl?: string;
  tags?: string[];
  artists?: string[];
  artistUids?: string[];
  genre?: string;
  status?: TrackStatus;
  // --- Новая модель: одна запись = одна версия проекта ---
  trackIds?: string[];
  variant?: ProjectVariant;
  vocalType?: ProjectVocalType;
  daw?: ProjectDaw;
  dawVersion?: string;
  stage?: ProjectStage;
  active?: boolean;
}

export type PlatformKind = 'soundcloud' | 'youtube' | 'yandex' | 'vkontakte' | 'audio' | 'other';

const AUDIO_EXT_RE = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|wma)(?:$|[?#])/i;

export function isDirectAudioUrl(url?: string): boolean {
  return AUDIO_EXT_RE.test((url || '').trim());
}

export function detectPlatform(url?: string): PlatformKind {
  const host = (url || '').toLowerCase();
  if (host.includes('soundcloud.com') || host.includes('w.soundcloud.com')
      || host.includes('on.soundcloud.com') || host.includes('snd.sc')) return 'soundcloud';
  if (host.includes('youtube.com') || host.includes('youtu.be')) return 'youtube';
  if (host.includes('music.yandex')) return 'yandex';
  if (host.includes('vk.com') || host.includes('vk.ru') || host.includes('vkontakte')) return 'vkontakte';
  if (isDirectAudioUrl(url)) return 'audio';
  return 'other';
}

export function youtubeVideoId(url: string): string | null {
  const m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(
    url.trim()
  );
  return m ? m[1] : null;
}

export function soundCloudEmbedSrc(url: string): string {
  return (
    'https://w.soundcloud.com/player/?' +
    `url=${encodeURIComponent(url)}` +
    '&auto_play=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&show_teaser=false&visual=false&color=%23f2740d&enable_api=true'
  );
}

export const CHECKLIST_TEMPLATES: Omit<ChecklistItem, 'id'>[] = [
  { label: 'Бит', status: 'pending' },
  { label: 'Текст', status: 'pending' },
  { label: 'Запись', status: 'pending' },
  { label: 'Сведение', status: 'pending' },
  { label: 'Мастеринг', status: 'pending' },
  { label: 'Обложка', status: 'pending' },
  { label: 'Контент (тизеры)', status: 'pending' },
  { label: 'Релиз', status: 'pending' },
];

export const KANBAN_COLUMNS: { id: KanbanColumn; title: string; color: string }[] = [
  { id: 'ideas', title: 'Идеи', color: '#6b7280' },
  { id: 'in_progress', title: 'В работе', color: '#3b82f6' },
  { id: 'review', title: 'На проверке', color: '#f59e0b' },
  { id: 'ready_to_publish', title: 'Готово к релизу', color: '#10b981' },
  { id: 'released', title: 'Вышло', color: '#8b5cf6' },
];

export const STATUS_LABELS: Record<TrackStatus, string> = {
  draft: 'Черновик',
  recording: 'Запись',
  mixing: 'Сведение',
  mastering: 'Мастеринг',
  ready: 'Готово',
  completed: 'Завершено',
};

export type TrackFormData = {
  title: string;
  artists: string[];
  artistUids: string[];
  beatmakers: string[];
  beatmakerUids: string[];
  mixBy: string[];
  mixByUids: string[];
  feat: string;
  project: string;
  trackNumber?: number;
  status: TrackStatus;
  column: KanbanColumn;
  priority: Track['priority'];
  checklist: ChecklistItem[];
  createdBy: string;
  releaseType?: ReleaseType;
};

export function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string');
  if (typeof v === 'string' && v.trim()) return [v];
  return [];
}

/**
 * Разрешает имена участников: где uid резолвится в известного пользователя — берём его имя,
 * иначе (незарегистрированный/кастомный ник) берём параллельное сохранённое имя.
 */
export function resolveNames(
  names: unknown,
  uids: unknown,
  userMap: Map<string, UserProfile>
): string[] {
  const nameArr = asArray(names);
  const uidArr = asArray(uids);
  const seen = new Set<string>();
  const out: string[] = [];
  const len = Math.max(nameArr.length, uidArr.length);
  for (let i = 0; i < len; i++) {
    const uid = uidArr[i];
    const u = uid ? userMap.get(uid) : undefined;
    let n = (u?.artistName || u?.displayName || '').trim();
    if (!n) n = (nameArr[i] || '').trim();
    const key = n.toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(n);
    }
  }
  return out;
}

export interface ArtistRequest {
  id: string;
  uid: string;
  displayName: string;
  email: string;
  artistName: string;
  roles: ArtistRole[];
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  reviewedBy?: string;
}


