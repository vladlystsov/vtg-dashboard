import { useState } from 'react';
import type { Track, ChecklistItem, KanbanColumn, ReleaseType, UserProfile } from '../types/track';
import { CHECKLIST_TEMPLATES, KANBAN_COLUMNS, RELEASE_TYPE_LABELS, asArray } from '../types/track';
import { useAuth } from '../contexts/AuthContext';
import { v4 as uuidv4 } from 'uuid';
import { uploadCover } from '../services/fileService';

interface TrackFormProps {
  initialTrack?: Track;
  members?: string[];
  projects: string[];
  existingNumbers?: Record<string, number[]>;
  users: { uid: string; displayName: string }[];
  userMap?: Map<string, UserProfile>;
  onClose: () => void;
  onSave: (data: any, id?: string) => Promise<void>;
}

const CHECKLIST_STATUS_ORDER: ChecklistItem['status'][] = ['pending', 'in_progress', 'done', 'review', 'verified'];

interface PersonSelectorProps {
  label: string;
  options: { uid: string; displayName: string }[];
  value: string[];
  valueUids: string[];
  onChange: (names: string[], uids: string[]) => void;
  placeholder: string;
}

function PersonSelector({ label, options, value, valueUids, onChange, placeholder }: PersonSelectorProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const trimmed = query.trim().toLowerCase();
  const filtered = options.filter(
    (o) => !valueUids.includes(o.uid) && (!trimmed || o.displayName.toLowerCase().includes(trimmed))
  );

  const add = (opt: { uid: string; displayName: string }) => {
    if (valueUids.includes(opt.uid)) return;
    onChange([...value, opt.displayName], [...valueUids, opt.uid]);
    setQuery('');
  };

  const addCustom = () => {
    if (trimmed && !value.some((v) => v.toLowerCase() === trimmed)) {
      onChange([...value, query.trim()], [...valueUids, '']);
    }
    setQuery('');
    setOpen(false);
  };

  const remove = (idx: number) => {
    const newNames = value.filter((_, i) => i !== idx);
    const newUids = valueUids.filter((_, i) => i !== idx);
    onChange(newNames, newUids);
  };

  return (
    <div className="form-group">
      <label>{label}</label>
      <div
        className="combobox"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      >
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); addCustom(); }
            else if (e.key === 'Escape') setOpen(false);
          }}
          placeholder={placeholder}
        />
        {open && filtered.length > 0 && (
          <div className="combobox-list">
            {filtered.map((o) => (
              <button
                type="button"
                key={o.uid}
                className="combobox-item"
                onMouseDown={(e) => { e.preventDefault(); add(o); }}
              >
                {o.displayName}
              </button>
            ))}
            {trimmed && !options.some((o) => o.displayName.toLowerCase() === trimmed) && (
              <button
                type="button"
                className="combobox-item combobox-create"
                onMouseDown={(e) => { e.preventDefault(); addCustom(); }}
              >
                + Добавить «{query.trim()}»
              </button>
            )}
          </div>
        )}
      </div>
      {value.length > 0 && (
        <div className="person-tags">
          {value.map((v, i) => (
            <span className="person-tag" key={`${v}-${i}`}>
              {v}
              <button type="button" className="person-tag-x" onClick={() => remove(i)}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TrackForm({
  initialTrack,
  projects,
  existingNumbers = {},
  users,
  onClose,
  onSave,
}: TrackFormProps) {
  const { profile } = useAuth();
  const [title, setTitle] = useState(initialTrack?.title || '');
  const [artists, setArtists] = useState<string[]>(initialTrack?.artists || []);
  const [artistUids, setArtistUids] = useState<string[]>(initialTrack?.artistUids || []);
  const [beatmakers, setBeatmakers] = useState<string[]>(initialTrack?.beatmakers || []);
  const [beatmakerUids, setBeatmakerUids] = useState<string[]>(initialTrack?.beatmakerUids || []);
  const [mixBy, setMixBy] = useState<string[]>(asArray(initialTrack?.mixBy));
  const [mixByUids, setMixByUids] = useState<string[]>(asArray(initialTrack?.mixByUids));
  const [feat, setFeat] = useState(initialTrack?.feat || '');
  const [project, setProject] = useState(initialTrack?.project || '');
  const [trackNumber, setTrackNumber] = useState<number | undefined>(initialTrack?.trackNumber || undefined);
  const [column, setColumn] = useState<KanbanColumn>(initialTrack?.column || 'ideas');
  const [priority, setPriority] = useState<Track['priority']>(initialTrack?.priority || 'medium');
  const [status, setStatus] = useState<Track['status']>(initialTrack?.status || 'draft');
  const [releaseType, setReleaseType] = useState<ReleaseType>(initialTrack?.releaseType || 'auto');
  const [checklist, setChecklist] = useState<ChecklistItem[]>(
    initialTrack?.checklist || CHECKLIST_TEMPLATES.map((t) => ({ ...t, id: uuidv4() }))
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(initialTrack?.coverUrl || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const hasProject = !!project;

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

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCoverFile(file);
      setCoverPreview(URL.createObjectURL(file));
    }
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    if (artists.length === 0) {
      setError('Укажи хотя бы одного основного артиста.');
      return;
    }

    const myName = profile?.artistName || profile?.displayName || '';
    const myUid = profile?.uid || '';
    const isInArtists = artistUids.includes(myUid) || artists.some((a) => a.toLowerCase() === myName.toLowerCase());
    const isInBeatmakers = beatmakerUids.includes(myUid) || beatmakers.some((b) => b.toLowerCase() === myName.toLowerCase());
    const isInMixBy = mixByUids.includes(myUid) || mixBy.some((m) => m.toLowerCase() === myName.toLowerCase());
    const isInFeat = feat.toLowerCase().includes(myName.toLowerCase());

    if (!isInArtists && !isInBeatmakers && !isInMixBy && !isInFeat) {
      setError('Ты должен быть указан хотя бы в одном из разделов: Артисты, Битмейкеры, Mix by или Feat.');
      return;
    }

    setSaving(true);
    setError('');

    const withTimeout = <T,>(p: Promise<T>, ms = 15000, label = 'операция'): Promise<T> =>
      Promise.race([
        p,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Сохранение: превышен таймаут (${label}). Проверьте интернет/правила Firestore.`)), ms)
        ),
      ]);

    let coverUrl = initialTrack?.coverUrl;
    try {
      if (coverFile) {
        coverUrl = await withTimeout(uploadCover(coverFile), 20000, 'обработка обложки');
      }
      const finalProject = project.trim();

      let finalNumber = trackNumber;
      if (finalProject) {
        if (finalNumber === undefined || finalNumber === null) {
          const used = new Set(existingNumbers[finalProject] || []);
          let candidate = 1;
          while (used.has(candidate)) candidate++;
          finalNumber = candidate;
        } else if (initialTrack?.project === finalProject && initialTrack?.trackNumber === finalNumber) {
          // same number, no conflict (editing same track)
        } else {
          const used = new Set((existingNumbers[finalProject] || []).filter((n) => !(initialTrack && initialTrack.project === finalProject && initialTrack.trackNumber === n)));
          if (used.has(finalNumber)) {
            setError(`Трек №${finalNumber} уже есть в проекте «${finalProject}». Укажи другой номер.`);
            setSaving(false);
            return;
          }
        }
      }

      const data = {
        title: title.trim(),
        artists,
        artistUids,
        beatmakers,
        beatmakerUids,
        mixBy,
        mixByUids,
        feat: feat.trim(),
        project: finalProject,
        trackNumber: finalNumber,
        coverUrl,
        status,
        column,
        priority,
        checklist,
        createdBy: profile?.uid || '',
        releaseType,
      };
      await withTimeout(onSave(data, initialTrack?.id), 20000, 'сохранение в Firestore');
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Не удалось сохранить. Проверьте подключение и повторите.');
    } finally {
      setSaving(false);
    }
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

          <PersonSelector
            label="Артисты (основные) *"
            options={users}
            value={artists}
            valueUids={artistUids}
            onChange={(names, uids) => { setArtists(names); setArtistUids(uids); }}
            placeholder="Введи имя и нажми Enter"
          />

          <div className="form-group">
            <label>Feat (гости)</label>
            <input
              type="text"
              value={feat}
              onChange={(e) => setFeat(e.target.value)}
              placeholder="Например: Skif (feat)"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Проект / Альбом</label>
              <select value={project} onChange={(e) => setProject(e.target.value)}>
                <option value="">Выберите проект/альбом</option>
                {projects.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            {hasProject && (
              <div className="form-group">
                <label>№ трека в альбоме</label>
                <input
                  type="number"
                  min={1}
                  value={trackNumber ?? ''}
                  onChange={(e) => setTrackNumber(e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="1"
                />
              </div>
            )}
          </div>

          {hasProject && (
            <>
              <PersonSelector
                label="Авторы (альбом)"
                options={users}
                value={artists}
                valueUids={artistUids}
                onChange={(names, uids) => { setArtists(names); setArtistUids(uids); }}
                placeholder="Участники альбома"
              />
              <PersonSelector
                label="Prod by (альбом)"
                options={users}
                value={beatmakers}
                valueUids={beatmakerUids}
                onChange={(names, uids) => { setBeatmakers(names); setBeatmakerUids(uids); }}
                placeholder="Продюсеры альбома"
              />
              <PersonSelector
                label="Mix by (альбом)"
                options={users}
                value={mixBy}
                valueUids={mixByUids}
                onChange={(names, uids) => { setMixBy(names); setMixByUids(uids); }}
                placeholder="Кто сводил альбом"
              />
              <button
                className="btn-add-inline"
                type="button"
                style={{ marginBottom: 14 }}
                onClick={() => {
                  const trackArtists = initialTrack?.artists || [];
                  const trackArtistUids = initialTrack?.artistUids || [];
                  const trackBeatmakers = initialTrack?.beatmakers || [];
                  const trackBeatmakerUids = initialTrack?.beatmakerUids || [];
                  const trackMixBy = asArray(initialTrack?.mixBy);
                  const trackMixByUids = asArray(initialTrack?.mixByUids);
                  setArtists(trackArtists);
                  setArtistUids(trackArtistUids);
                  setBeatmakers(trackBeatmakers);
                  setBeatmakerUids(trackBeatmakerUids);
                  setMixBy(trackMixBy);
                  setMixByUids(trackMixByUids);
                }}
              >
                Подставить из трека
              </button>
            </>
          )}

          <div className="form-group">
            <label>Тип релиза</label>
            <select value={releaseType} onChange={(e) => setReleaseType(e.target.value as ReleaseType)}>
              <option value="auto">Автоопределение</option>
              <option value="single">{RELEASE_TYPE_LABELS.single} (1–3 трека)</option>
              <option value="ep">{RELEASE_TYPE_LABELS.ep} (4–7 треков)</option>
              <option value="album">{RELEASE_TYPE_LABELS.album} (8+ треков)</option>
            </select>
          </div>

          <div className="form-group">
            <label>Обложка</label>
            <div className="cover-upload">
              {coverPreview && <img className="cover-preview" src={coverPreview} alt="Обложка" />}
              <input type="file" accept="image/*" onChange={handleCoverChange} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Доска</label>
              <select value={column} onChange={(e) => setColumn(e.target.value as KanbanColumn)}>
                {KANBAN_COLUMNS.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
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

          <div className="form-group">
            <label>Приоритет</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as Track['priority'])}>
              <option value="low">Низкий</option>
              <option value="medium">Средний</option>
              <option value="high">Высокий</option>
            </select>
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
                    {item.status === 'verified' || item.status === 'done' ? '✓' : item.status === 'review' ? '?' : item.status === 'in_progress' ? '•' : '○'}
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
          {error && <div className="error-msg form-error">{error}</div>}
          <button className="btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}
