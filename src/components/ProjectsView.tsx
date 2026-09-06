import { useMemo, useRef, useState } from 'react';
import type { Project, Track, UserProfile } from '../types/track';
import { PROJECT_VARIANT_LABELS, PROJECT_VOCAL_TYPE_LABELS } from '../types/track';
import { checkProjectZipFile, publishProjectZipInBackground } from '../services/archiveService';
import { format } from 'date-fns';

interface ProjectsViewProps {
  projects: Project[];
  tracks: Track[];
  userMap: Map<string, UserProfile>;
  canEdit: boolean;
  onSave: (id: string | null, data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export default function ProjectsView({
  projects,
  tracks,
  userMap,
  canEdit,
  onSave,
  onDelete,
}: ProjectsViewProps) {
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [zipError, setZipError] = useState<string | null>(null);
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const fileInputs = useRef(new Map<string, HTMLInputElement>());

  const trackById = useMemo(() => {
    const m = new Map<string, Track>();
    for (const t of tracks) m.set(t.id, t);
    return m;
  }, [tracks]);

  const projectTracks = (p: Project): Track[] =>
    (p.tracks || []).map((id) => trackById.get(id)).filter(Boolean) as Track[];

  const create = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await onSave(null, { name: newName.trim(), createdBy: '' });
      setNewName('');
    } finally {
      setCreating(false);
    }
  };

  const pickZip = (p: Project) => {
    const input = fileInputs.current.get(p.id);
    input?.click();
  };

  const uploadZip = (p: Project, file: File) => {
    const err = checkProjectZipFile(file);
    if (err) {
      setZipError(`${p.name}: ${err}`);
      setTimeout(() => setZipError(null), 4000);
      return;
    }
    setUploadingId(p.id);
    void onSave(p.id, {
      ...p,
      zipStatus: 'uploading',
      zipError: undefined,
    }).then(async () => {
      publishProjectZipInBackground({
        file,
        title: `VTG ${p.name}`,
        description: `Проект ${p.name}`,
        creator: 'VTG',
        callbacks: {
          onReady: (url) => {
            void onSave(p.id, { ...p, zipUrl: url, zipStatus: 'ready' as const, zipError: undefined }).finally(() =>
              setUploadingId(null)
            );
          },
          onError: (message) => {
            void onSave(p.id, {
              ...p,
              zipStatus: 'error' as const,
              zipError: message,
            }).finally(() => setUploadingId(null));
          },
        },
      });
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
          <div className="project-create-row">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Название нового проекта"
              onKeyDown={(e) => e.key === 'Enter' && void create()}
            />
            <button className="btn-primary" disabled={creating || !newName.trim()} onClick={() => void create()}>
              Создать
            </button>
          </div>
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
                <div className="project-card-header">
                  <span className="project-card-title">{p.name}</span>
                  <span className="column-count">{ptracks.length}</span>
                </div>
                <div className="project-card-meta">
                  {p.createdAt && format(new Date(p.createdAt), 'dd.MM.yyyy')}
                </div>

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
                    if (f) uploadZip(p, f);
                    e.target.value = '';
                  }}
                />

                <div className="project-card-tracks">
                  <div className="project-card-section-title">Треки</div>
                  {ptracks.length === 0 ? (
                    <div className="project-card-empty">Треки появятся здесь после назначения в карточке трека</div>
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
    </div>
  );
}