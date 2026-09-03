export type TrackStatus = 'draft' | 'recording' | 'mixing' | 'mastering' | 'ready';

export type KanbanColumn = 'ideas' | 'in_progress' | 'review' | 'ready_to_publish' | 'released';

export type ChecklistStatus = 'pending' | 'in_progress' | 'done' | 'review' | 'verified';

export type UserRole = 'member' | 'admin' | 'owner';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  avatarUrl?: string;
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
  artist: string;
  beatmaker: string;
  project: string;
  status: TrackStatus;
  column: KanbanColumn;
  checklist: ChecklistItem[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  priority: 'low' | 'medium' | 'high';
}

export const CHECKLIST_TEMPLATES: Omit<ChecklistItem, 'id'>[] = [  { label: 'Бит', status: 'pending' },
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
  artist: string;
  beatmaker: string;
  project: string;
  status: TrackStatus;
  column: KanbanColumn;
  priority: Track['priority'];
  checklist: ChecklistItem[];
  createdBy: string;
};
