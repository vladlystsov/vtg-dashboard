export type TrackStatus = 'draft' | 'recording' | 'mixing' | 'mastering' | 'ready';

export type KanbanColumn = 'ideas' | 'in_progress' | 'review' | 'ready_to_publish' | 'released';

export type ChecklistStatus = 'pending' | 'in_progress' | 'done' | 'review' | 'verified';

export type UserRole = 'member' | 'admin' | 'owner';

export type ArtistRole = 'artist' | 'beatmaker' | 'mixer' | 'feat';

export type ReleaseType = 'single' | 'ep' | 'album' | 'auto';

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
