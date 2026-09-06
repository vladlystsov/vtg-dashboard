import { useMemo, useRef, useState } from 'react';
import type { Project, Track, TrackProjectZip, TrackStatus, UserProfile } from '../types/track';
import { PROJECT_VARIANT_LABELS, PROJECT_VOCAL_TYPE_LABELS, STATUS_LABELS } from '../types/track';
import { checkProjectZipFile, publishProjectZipInBackground } from '../services/archiveService';
import { format } from 'date-fns';

interface ProjectsViewProps {
  projects: Project[];
  tracks: Track[];
  userMap: Map<string, UserProfile>;
  canEdit: boolean;
  onSave: (id: string | null, data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onUpdateTrack: (id: string, patch: Partial<Track>) => Promise<void>;
}

interface ZipUploadState {
  project: Project;
  trackId: string;
  file: File;
}

interface ProjectFormState {
  name: string;
  description: string;
  genre: string;
  tags: string;
  artists: string;
  coverUrl: string;
  status: TrackStatus;
}

const EMPTY_PROJECT_FORM: ProjectFormState = {
  name: '',
  description: '',
  genre: '',
  tags: '',
  artists: '',
  coverUrl: '',
  status: 'draft',
};

export default function ProjectsView({
  projects,
  tracks,
  userMap,
  canEdit,
  onSave,
  onDelete,
  onUpdateTrack,
}: ProjectsViewProps) {
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<ProjectFormState>(EMPTY_PROJECT_FORM);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [zipError, setZipError] = useState<string | null>(null);
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [uploadModal, setUploadModal] = useState<ZipUploadState | null>(null);
  const fileInputs = useRef(new Map<string, HTMLInputElement>());

  const trackById = useMemo(() => {
    const m = new Map<string, Track>();
    for (const t of tracks) m.set(t.id, t);
    return m;
  }, [tracks]);

  const projectTracks = (p: Project): Track[] =>
    (p.tracks || []).map((id) => trackById.get(id)).filter(Boolean) as Track[];

  const create = async () => {
    if (!createForm.name.trim()) return;
    setCreating(true);
    try {
      const artists = createForm.artists.split(',').map((s) => s.trim()).filter(Boolean);
      await onSave(editingProjectId, {
        name: createForm.name.trim(),
        description: createForm.description.trim() || undefined,
        genre: createForm.genre.trim() || undefined,
        tags: createForm.tags.split(',').map((s) => s.trim()).filter(Boolean).length
          ? createForm.tags.split(',').map((s) => s.trim()).filter(Boolean)
          : undefined,
        artists: artists.length ? artists : undefined,
        artistUids: undefined,
        coverUrl: createForm.coverUrl.trim() || undefined,
        status: createForm.status,
        createdBy: '',
      });
      setCreateOpen(false);
      setEditingProjectId(null);
      setCreateForm(EMPTY_PROJECT_FORM);
    } finally {
      setCreating(false);
    }
  };

  const pickZip = (p: Project) => {
    const input = fileInputs.current.get(p.id);
    input?.click();
  };

  const onFileSelected = (p: Project, file: File) => {
    const err = checkProjectZipFile(file);
    if (err) {
      setZipError(`${p.name}: ${err}`);
      setTimeout(() => setZipError(null), 4000);
      return;
    }
    // Окно загрузки как у бита/трека: обязательно выбрать трек
    setUploadModal({ project: p, trackId: (p.tracks || [])[0] || '', file });
  };

  const uploadZip = async (state: ZipUploadState) => {
    const { project: p, trackId, file } = state;
    if (!trackId) return;
    const track = trackById.get(trackId);
    if (!track) return;
    setUploadingId(p.id);
    setUploadModal(null);
    await onSave(p.id, {
      ...p,
      zipStatus: 'uploading',
      zipError: undefined,
    });

    const patchTrackProjectZip = (patch: Partial<TrackProjectZip>) => {
      const existing = (track.projectZips || []);
      const idx = existing.findIndex((z) => z.projectId === p.id);
      const next: TrackProjectZip = {
        projectId: p.id,
        projectName: p.name,
        uploadedAt: idx >= 0 ? existing[idx].uploadedAt : new Date().toISOString(),
        ...(idx >= 0 ? existing[idx] : {}),
        ...patch,
      };
      return onUpdateTrack(track.id, {
        projectZips: idx >= 0 ? existing.map((z, i) => (i === idx ? next : z)) : [...existing, next],
      });
    };

    void patchTrackProjectZip({ zipStatus: 'uploading', zipError: undefined });

    publishProjectZipInBackground({
      file,
      title: `VTG ${p.name}`,
      description: `Проект ${p.name}`,
      creator: 'VTG',
      callbacks: {
        onReady: (url) => {
          void onSave(p.id, { ...p, zipUrl: url, zipStatus: 'ready' as const, zipError: undefined })
            .then(() => patchTrackProjectZip({ zipUrl: url, zipStatus: 'ready', zipError: undefined }))
            .finally(() => setUploadingId(null));
        },
        onError: (message) => {
          void onSave(p.id, {
            ...p,
            zipStatus: 'error' as const,
            zipError: message,
          })
            .then(() => patchTrackProjectZip({ zipStatus: 'error', zipError: message }))
            .finally(() => setUploadingId(null));
        },
      },
    });
  };

  const addTrack = async (p: Project, id: string) => {
    const ids = (p.tracks || []).filter((x) => x !== id);
    if (!ids.includes(id)) ids.push(id);
    await onSave(p.id, { ...p, tracks: ids });
    setEditingTrackId(null);
  };

  const removeTrack = async (p: Project, id: string) => {
    await onSave(p.id, { ...p, tracks: (p.tracks || []).filter((x) => x !== id) });
  };

  const renderZipSection = (p: Project) => {
    const status = p.zipStatus;
    if (uploadingId === p.id || status === 'uploading') {
      return (
        <div className="project-zip project-zip-uploading">
          <span className="project-zip-spinner" /> Загружаем архив проекта в Archive.org…
        </div>
      );
    }
    if (status === 'error' || p.zipError) {
      return (
        <div className="project-zip project-zip-error">
          <span>{p.zipError || 'Ошибка публикации'}</span>
          <button type="button" className="btn-small-ghost" onClick={() => pickZip(p)}>
            Попробовать снова
          </button>
        </div>
      );
    }
    if (p.zipUrl) {
      return (
        <div className="project-zip project-zip-ready">
          <span className="project-zip-ok">✓</span>
          <a href={p.zipUrl} target="_blank" rel="noreferrer">
            Скачать архив проекта
          </a>
          <button type="button" className="btn-small-ghost" onClick={() => pickZip(p)}>
            Заменить
          </button>
        </div>
      );
    }
    return (
      <button type="button" className="btn-small-ghost" onClick={() => pickZip(p)}>
        ⬆ Загрузить архив проекта (.zip до 1 ГБ)
      </button>
    );
  };

  return (
    <div className="projects-view">
      <div className="beats-head">
        <h2>Проекты</h2>
        {canEdit && (
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setEditingProjectId(null);
              setCreateForm(EMPTY_PROJECT_FORM);
              setCreateOpen(true);
            }}
          >
            + Новый проект
          </button>
        )}
      </div>

      {zipError && <div className="error-msg">{zipError}</div>}

      {projects.length === 0 ? (
        <div className="beats-empty">
          Проектов пока нет. Создайте проект, чтобы собрать треки и загрузить архивы (.zip).
        </div>
      ) : (
        <div className="projects-grid">
          {projects.map((p) => {
            const ptracks = projectTracks(p);
            return (
              <div className="project-card" key={p.id}>
                {p.coverUrl && (
                  <div className="project-card-cover">
                    <img src={p.coverUrl} alt={p.name} />
                  </div>
                )}
                <div className="project-card-header">
                  <span className="project-card-title">{p.name}</span>
                  <span className="column-count">{ptracks.length}</span>
                </div>
                <div className="project-card-meta">
                  {p.createdAt && format(new Date(p.createdAt), 'dd.MM.yyyy')}
                  {p.status && STATUS_LABELS[p.status] && (
                    <span className={`at-status status-${p.status}`}>{STATUS_LABELS[p.status]}</span>
                  )}
                </div>

                {(p.description || p.genre || (p.tags && p.tags.length > 0)) && (
                  <div className="project-card-info">
                    {p.description && <div className="project-card-desc">{p.description}</div>}
                    <div className="project-card-tags">
                      {p.genre && <span className="beat-chip">{p.genre}</span>}
                      {(p.tags || []).map((t) => (
                        <span key={t} className="beat-chip">#{t}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="project-card-section">{renderZipSection(p)}</div>

                <input
                  ref={(el) => {
                    if (el) fileInputs.current.set(p.id, el);
                    else fileInputs.current.delete(p.id);
                  }}
                  type="file"
                  accept=".zip"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onFileSelected(p, f);
                    e.target.value = '';
                  }}
                />

                <div className="project-card-tracks">
                  <div className="project-card-section-title">Треки</div>
                  {ptracks.length === 0 ? (
                    <div className="project-card-empty">
                      Сначала добавьте трек проекта — при загрузке архива (.zip) трек обязателен
                    </div>
                  ) : (
                    ptracks.map((t) => {
                      const meta = p.variants?.[t.id];
                      const label = [
                        ...(meta?.variant ? [PROJECT_VARIANT_LABELS[meta.variant]] : []),
                        ...(meta?.vocalType ? [PROJECT_VOCAL_TYPE_LABELS[meta.vocalType]] : []),
                      ].join(' · ');
                      const artistName = (t.artists || [])
                        .map((a) => (a ? String(a) : ''))
                        .filter(Boolean)[0];
                      return (
                        <div className="project-track-row" key={t.id}>
                          <span className="project-track-title">
                            {t.trackNumber ? `${t.trackNumber}. ` : ''}
                            {t.title}
                          </span>
                          <span className="project-track-meta">
                            {label || artistName || userMap.get(t.artistUids?.[0] || '')?.artistName || ''}
                          </span>
                          {canEdit && (
                            <button
                              type="button"
                              className="at-delete"
                              title="Убрать из проекта"
                              onClick={() => void removeTrack(p, t.id)}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                  {canEdit && (
                    <div className="project-track-add">
                      <select
                        value={editingTrackId || ''}
                        onChange={(e) => {
                          if (e.target.value) void addTrack(p, e.target.value);
                        }}
                      >
                        <option value="">+ Добавить трек…</option>
                        {tracks
                          .filter((t) => !(p.tracks || []).includes(t.id))
                          .slice(0, 100)
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.title}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                </div>

                {canEdit && (
                  <div className="project-card-actions">
                    <button
                      type="button"
                      className="btn-small-ghost"
                      onClick={() => {
                        setEditingProjectId(p.id);
                        setCreateForm({
                          name: p.name,
                          description: p.description || '',
                          genre: p.genre || '',
                          tags: (p.tags || []).join(', '),
                          artists: (p.artists || []).join(', '),
                          coverUrl: p.coverUrl || '',
                          status: p.status || 'draft',
                        });
                        setCreateOpen(true);
                      }}
                    >
                      Редактировать проект
                    </button>
                    <button
                      type="button"
                      className="btn-small-ghost btn-danger"
                      disabled={deletingId === p.id}
                      onClick={() => {
                        if (!window.confirm(`Удалить проект «${p.name}»?`)) return;
                        setDeletingId(p.id);
                        void onDelete(p.id).finally(() => setDeletingId(null));
                      }}
                    >
                      Удалить проект
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {createOpen && (
        <div className="modal-overlay" onClick={() => { if (!creating) setCreateOpen(false); }}>
          <div className="track-form-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingProjectId ? `Редактировать проект: ${createForm.name}` : 'Новый проект'}</h2>
              <button className="modal-close" onClick={() => { if (!creating) setCreateOpen(false); }}>×</button>
            </div>

            <div className="form-section">
              <div className="form-group">
                <label>Название *</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="Название проекта/сборника"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Жанр</label>
                  <input
                    type="text"
                    value={createForm.genre}
                    onChange={(e) => setCreateForm({ ...createForm, genre: e.target.value })}
                    placeholder="Hip-Hop"
                  />
                </div>
                <div className="form-group">
                  <label>Статус</label>
                  <select
                    value={createForm.status}
                    onChange={(e) => setCreateForm({ ...createForm, status: e.target.value as TrackStatus })}
                  >
                    {Object.entries(STATUS_LABELS).map(([id, label]) => (
                      <option key={id} value={id}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Описание</label>
                <textarea
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="Пара слов о проекте: задача, идея, детали"
                />
              </div>

              <div className="form-group">
                <label>Артисты (через запятую)</label>
                <input
                  type="text"
                  value={createForm.artists}
                  onChange={(e) => setCreateForm({ ...createForm, artists: e.target.value })}
                  placeholder="Основные исполнители проекта"
                />
              </div>

              <div className="form-group">
                <label>Теги (через запятую)</label>
                <input
                  type="text"
                  value={createForm.tags}
                  onChange={(e) => setCreateForm({ ...createForm, tags: e.target.value })}
                  placeholder="dark, концепт, альбом"
                />
              </div>

              <div className="form-group">
                <label>Обложка (ссылка)</label>
                <input
                  type="url"
                  value={createForm.coverUrl}
                  onChange={(e) => setCreateForm({ ...createForm, coverUrl: e.target.value })}
                  placeholder="https://…/cover.jpg"
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setCreateOpen(false)} disabled={creating}>
                Отмена
              </button>
              <button className="btn-primary" onClick={() => void create()} disabled={creating || !createForm.name.trim()}>
                {creating ? 'Создание…' : editingProjectId ? 'Сохранить проект' : 'Создать проект'}
              </button>
            </div>
          </div>
        </div>
      )}

      {uploadModal && (
        <div className="modal-overlay" onClick={() => setUploadModal(null)}>
          <div className="track-form-modal project-zip-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Загрузка архива проекта «{uploadModal.project.name}»</h2>
              <button className="modal-close" onClick={() => setUploadModal(null)}>×</button>
            </div>
            <div className="form-section">
              <div className="form-group">
                <label>Трек *</label>
                <select
                  value={uploadModal.trackId}
                  onChange={(e) => setUploadModal({ ...uploadModal, trackId: e.target.value })}
                >
                  {!uploadModal.trackId && <option value="">Без трека</option>}
                  {(uploadModal.project.tracks || []).map((id) => {
                    const t = trackById.get(id);
                    if (!t) return null;
                    return (
                      <option key={id} value={id}>
                        {t.trackNumber ? `${t.trackNumber}. ` : ''}{t.title}
                      </option>
                    );
                  })}
                  {(uploadModal.project.tracks || []).length === 0 && (
                    <option value="">Сначала добавьте трек в проект</option>
                  )}
                </select>
              </div>
              <div className="form-hint">
                Файл «{uploadModal.file.name}» ({(uploadModal.file.size / 1024 / 1024).toFixed(1)} МБ) будет загружен
                в Archive.org и привязан к выбранному треку.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setUploadModal(null)}>Отмена</button>
              <button
                className="btn-primary"
                disabled={!uploadModal.trackId}
                onClick={() => void uploadZip(uploadModal)}
              >
                Загрузить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}