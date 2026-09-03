import { useState } from 'react';
import type { Track, ChecklistItem, KanbanColumn } from '../types/track';
import { CHECKLIST_TEMPLATES, KANBAN_COLUMNS } from '../types/track';
import { useAuth } from '../contexts/AuthContext';
import { v4 as uuidv4 } from 'uuid';

interface TrackFormProps {
  initialTrack?: Track;
  artists: string[];
  beatmakers: string[];
  projects: string[];
  users: { uid: string; displayName: string }[];
  onClose: () => void;
  onSave: (data: any, id?: string) => Promise<void>;
}

const CHECKLIST_STATUS_ORDER: ChecklistItem['status'][] = ['pending', 'in_progress', 'done', 'review', 'verified'];

export default function TrackForm({
  initialTrack,
  artists,
  beatmakers,
  projects,
  users,
  onClose,
  onSave,
}: TrackFormProps) {
  const { profile } = useAuth();
  const [title, setTitle] = useState(initialTrack?.title || '');
  const [artist, setArtist] = useState(initialTrack?.artist || '');
  const [beatmaker, setBeatmaker] = useState(initialTrack?.beatmaker || '');
  const [project, setProject] = useState(initialTrack?.project || '');
  const [column, setColumn] = useState<KanbanColumn>(initialTrack?.column || 'ideas');
  const [priority, setPriority] = useState<Track['priority']>(initialTrack?.priority || 'medium');
  const [status, setStatus] = useState<Track['status']>(initialTrack?.status || 'draft');
  const [checklist, setChecklist] = useState<ChecklistItem[]>(
    initialTrack?.checklist || CHECKLIST_TEMPLATES.map((t) => ({ ...t, id: uuidv4() }))
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [newArtist, setNewArtist] = useState('');
  const [newBeatmaker, setNewBeatmaker] = useState('');
  const [newProject, setNewProject] = useState('');
  const [saving, setSaving] = useState(false);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateChecklistItem = (id: string, patch: Partial<ChecklistItem>) => {
    setChecklist((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const advanceStatus = (id: string) => {
    const item = checklist.find((c) => c.id === id);
    if (!item) return;
    const idx = CHECKLIST_STATUS_ORDER.indexOf(item.status);
    const next = CHECKLIST_STATUS_ORDER[Math.min(idx + 1, CHECKLIST_STATUS_ORDER.length - 1)];
    updateChecklistItem(id, { status: next });
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const data = {
      title: title.trim(),
      artist: newArtist || artist || '—',
      beatmaker: newBeatmaker || beatmaker || '—',
      project: newProject || project || 'Без проекта',
      status,
      column,
      priority,
      checklist,
      createdBy: profile?.uid || '',
    };
    await onSave(data, initialTrack?.id);
    setSaving(false);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="track-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{initialTrack ? 'Редактировать трек' : 'Новый трек'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="form-section">
          <div className="form-group">
            <label>Название трека *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Название трека"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Артист</label>
              {newArtist ? (
                <input value={newArtist} onChange={(e) => setNewArtist(e.target.value)} />
              ) : (
                <>
                  <select value={artist} onChange={(e) => setArtist(e.target.value)}>
                    <option value="">Выберите артиста</option>
                    {artists.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <button className="btn-add-inline" onClick={() => setArtist('__new__')}>
                    + Новый артист
                  </button>
                </>
              )}
            </div>
            <div className="form-group">
              <label>Битмейкер</label>
              {newBeatmaker ? (
                <input value={newBeatmaker} onChange={(e) => setNewBeatmaker(e.target.value)} />
              ) : (
                <>
                  <select value={beatmaker} onChange={(e) => setBeatmaker(e.target.value)}>
                    <option value="">Выберите битмейкера</option>
                    {beatmakers.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                  <button className="btn-add-inline" onClick={() => setBeatmaker('__new__')}>
                    + Новый битмейкер
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Проект / Альбом</label>
              {newProject ? (
                <input value={newProject} onChange={(e) => setNewProject(e.target.value)} />
              ) : (
                <>
                  <select value={project} onChange={(e) => setProject(e.target.value)}>
                    <option value="">Выберите проект</option>
                    {projects.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <button className="btn-add-inline" onClick={() => setProject('__new__')}>
                    + Новый проект
                  </button>
                </>
              )}
            </div>
            <div className="form-group">
              <label>Доска</label>
              <select value={column} onChange={(e) => setColumn(e.target.value as KanbanColumn)}>
                {KANBAN_COLUMNS.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Приоритет</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as Track['priority'])}>
                <option value="low">Низкий</option>
                <option value="medium">Средний</option>
                <option value="high">Высокий</option>
              </select>
            </div>
            <div className="form-group">
              <label>Статус</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as Track['status'])}>
                <option value="draft">Черновик</option>
                <option value="recording">Запись</option>
                <option value="mixing">Сведение</option>
                <option value="mastering">Мастеринг</option>
                <option value="ready">Готово</option>
              </select>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3>Чек-лист</h3>
          <div className="checklist">
            {checklist.map((item) => (
              <div className={`checklist-item ${item.status}`} key={item.id}>
                <div className="checklist-item-header">
                  <button
                    className={`status-btn status-${item.status}`}
                    onClick={() => advanceStatus(item.id)}
                    title={`Статус: ${item.status}. Нажмите, чтобы продвинуть`}
                  >
                    {item.status === 'verified' ? '✓' : item.status === 'done' ? '✓' : item.status === 'review' ? '?' : item.status === 'in_progress' ? '•' : '○'}
                  </button>
                  <span className="checklist-label">{item.label}</span>
                  <button className="checklist-toggle" onClick={() => toggleExpand(item.id)}>
                    {expanded.has(item.id) ? '▲' : '▼'}
                  </button>
                </div>

                {expanded.has(item.id) && (
                  <div className="checklist-details">
                    <div className="form-group">
                      <label>Статус</label>
                      <select
                        value={item.status}
                        onChange={(e) => updateChecklistItem(item.id, { status: e.target.value as ChecklistItem['status'] })}
                      >
                        {CHECKLIST_STATUS_ORDER.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Ответственный</label>
                      <select
                        value={item.assignee || ''}
                        onChange={(e) => updateChecklistItem(item.id, { assignee: e.target.value })}
                      >
                        <option value="">Не назначен</option>
                        {users.map((u) => (
                          <option key={u.uid} value={u.displayName}>{u.displayName}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Дедлайн</label>
                      <input
                        type="date"
                        value={item.deadline || ''}
                        onChange={(e) => updateChecklistItem(item.id, { deadline: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Комментарий</label>
                      <textarea
                        value={item.comment || ''}
                        onChange={(e) => updateChecklistItem(item.id, { comment: e.target.value })}
                        placeholder="Добавьте комментарий"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}
