import { useMemo, useState } from 'react';
import type { Project, Track, TrackProjectZip, TrackStatus, UserProfile } from '../types/track';
import {
  PROJECT_DAW_LABELS,
  PROJECT_STAGE_LABELS,
  PROJECT_STAGES,
  PROJECT_VARIANT_LABELS,
  PROJECT_VOCAL_TYPES,
  PROJECT_VOCAL_TYPE_LABELS,
  STATUS_LABELS,
} from '../types/track';
import type { ProjectDaw, ProjectStage, ProjectVariant, ProjectVocalType } from '../types/track';
import { checkProjectZipFile, publishProjectZipInBackground } from '../services/archiveService';
import { asArray } from '../types/track';

interface ProjectsViewProps {
  projects: Project[];
  tracks: Track[];
  userMap: Map<string, UserProfile>;
  canEdit: boolean;
  onSave: (
    id: string | null,
    data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>
  ) => Promise<string | undefined>;
  onDelete: (id: string) => Promise<void>;
  onUpdateTrack: (id: string, patch: Partial<Track>) => Promise<void>;
}

// Релиз = альбом (группа треков по track.project) или сингл (трек без сборника).
interface Release {
  id: string;
  kind: 'album' | 'single';
  title: string;
  cover?: string;
  tracks: Track[];
}

const STATUS_ORDER: TrackStatus[] = ['draft', 'recording', 'mixing', 'mastering', 'ready', 'completed'];

function releaseStageLabel(tracks: Track[]): string | null {
  let best: TrackStatus | null = null;
  for (const t of tracks) {
    const i = STATUS_ORDER.indexOf(t.status);
    const bi = best ? STATUS_ORDER.indexOf(best) : -1;
    if (!best || i > bi) best = t.status;
  }
  return best || null;
}

function projectTrackIds(p: Project): string[] {
  const ids = Array.isArray(p.trackIds) ? p.trackIds : [];
  const legacy = Array.isArray(p.tracks) ? p.tracks.filter((x): x is string => typeof x === 'string') : [];
  return Array.from(new Set([...ids, ...legacy]));
}

function overlap(a: string[], b: string[]): boolean {
  return a.some((x) => b.includes(x));
}

interface VersionFormState {
  editing?: Project;
  trackIds: string[];
  name: string;
  variant: ProjectVariant;
  vocalType: ProjectVocalType | '';
  daw: ProjectDaw;
  dawVersion: string;
  stage: ProjectStage;
  active: boolean;
  zipFile: File | null;
  description: string;
  genre: string;
  tags: string;
  artists: string;
  coverUrl: string;
  status: TrackStatus;
}

const DEFAULT_DLD_VERSION = '25';

function emptyForm(preselectedTrackIds: string[] = [], preselectedTitle = ''): VersionFormState {
  return {
    trackIds: preselectedTrackIds,
    name: preselectedTitle,
    variant: 'main',
    vocalType: '',
    daw: 'fl',
    dawVersion: DEFAULT_DLD_VERSION,
    stage: 'mixing',
    active: true,
    zipFile: null,
    description: '',
    genre: '',
    tags: '',
    artists: '',
    coverUrl: '',
    status: 'draft',
  };
}

export default function ProjectsView({
  projects,
  tracks,
  userMap,
  canEdit,
  onSave,
  onDelete,
  onUpdateTrack,
}: ProjectsViewProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [zipError, setZipError] = useState<string | null>(null);
  const [modal, setModal] = useState<VersionFormState | null>(null);
  const [savingVersion, setSavingVersion] = useState(false);

  const trackById = useMemo(() => {
    const m = new Map<string, Track>();
    for (const t of tracks) m.set(t.id, t);
    return m;
  }, [tracks]);

  const releases = useMemo<Release[]>(() => {
    const map = new Map<string, Track[]>();
    for (const t of tracks) {
      if (t.project) {
        const arr = map.get(t.project) ?? [];
        arr.push(t);
        map.set(t.project, arr);
      }
    }
    const out: Release[] = [];
    for (const [name, arr] of map) {
      arr.sort((a, b) => (a.trackNumber || 0) - (b.trackNumber || 0));
      out.push({
        id: `album:${name}`,
        kind: 'album',
        title: name,
        cover: arr.find((t) => t.coverUrl)?.coverUrl,
        tracks: arr,
      });
    }
    for (const t of tracks.filter((t) => !t.project)) {
      out.push({ id: `single:${t.id}`, kind: 'single', title: t.title, cover: t.coverUrl, tracks: [t] });
    }
    out.sort((a, b) => {
      const la = Math.max(...a.tracks.map((t) => new Date(t.updatedAt || t.createdAt || 0).getTime()));
      const lb = Math.max(...b.tracks.map((t) => new Date(t.updatedAt || t.createdAt || 0).getTime()));
      return lb - la;
    });
    return out;
  }, [tracks]);

  const releaseTrackIds = (r: Release) => r.tracks.map((t) => t.id);

  const versionsFor = (r: Release): Project[] =>
    projects.filter((p) => overlap(projectTrackIds(p), releaseTrackIds(r)));

  const publishZip = (
    savedProject: Project,
    file: File,
    trackIds: string[]
  ) => {
    setUploadingId(savedProject.id);
    const patchTrackProjectZip = (patch: Partial<TrackProjectZip>) => {
      const now = new Date().toISOString();
      for (const trackId of trackIds) {
        const track = trackById.get(trackId);
        if (!track) continue;
        const existing = track.projectZips || [];
        const idx = existing.findIndex((z) => z.projectId === savedProject.id);
        const next: TrackProjectZip = {
          projectId: savedProject.id,
          projectName: savedProject.name,
          uploadedAt: idx >= 0 ? existing[idx].uploadedAt : now,
          ...(idx >= 0 ? existing[idx] : {}),
          ...patch,
        };
        void onUpdateTrack(track.id, {
          projectZips: idx >= 0 ? existing.map((z, i) => (i === idx ? next : z)) : [...existing, next],
        });
      }
    };

    void onSave(savedProject.id, {
      ...savedProject,
      zipStatus: 'uploading',
      zipError: undefined,
    });

    publishProjectZipInBackground({
      file,
      title: `VTG ${savedProject.name}`,
      description: `Проект ${savedProject.name}`,
      creator: 'VTG',
      callbacks: {
        onReady: (url) => {
          void onSave(savedProject.id, {
            ...savedProject,
            zipUrl: url,
            zipStatus: 'ready' as const,
            zipError: undefined,
          })
            .then(() => patchTrackProjectZip({ zipUrl: url, zipStatus: 'ready', zipError: undefined }))
            .finally(() => setUploadingId(null));
        },
        onError: (message) => {
          void onSave(savedProject.id, {
            ...savedProject,
            zipStatus: 'error' as const,
            zipError: message,
          })
            .then(() => patchTrackProjectZip({ zipStatus: 'error', zipError: message }))
            .finally(() => setUploadingId(null));
        },
      },
    });
  };

  const deactivateOverlapping = async (self: Project | null, trackIds: string[]) => {
    const others = projects.filter((p) => {
      if (self && p.id === self.id) return false;
      return overlap(projectTrackIds(p), trackIds);
    });
    for (const p of others) {
      if (p.active) {
        await onSave(p.id, { ...p, active: false } as Omit<Project, 'id' | 'createdAt' | 'updatedAt'>);
      }
    }
  };

  const saveVersion = async () => {
    if (!modal) return;
    if (modal.trackIds.length === 0) {
      setZipError('Выберите хотя бы один релиз, который обслуживает версия.');
      setTimeout(() => setZipError(null), 4000);
      return;
    }
    if (modal.zipFile) {
      const err = checkProjectZipFile(modal.zipFile);
      if (err) {
        setZipError(err);
        setTimeout(() => setZipError(null), 4000);
        return;
      }
    }
    const name = modal.name.trim() || 'Без названия';
    const payload: Omit<Project, 'id' | 'createdAt' | 'updatedAt'> = {
      name,
      trackIds: modal.trackIds,
      variant: modal.variant,
      vocalType: modal.vocalType ? (modal.vocalType as ProjectVocalType) : undefined,
      daw: modal.daw,
      dawVersion: modal.dawVersion.trim() || undefined,
      stage: modal.stage,
      active: modal.active,
      zipStatus: modal.zipFile ? ('uploading' as const) : undefined,
      description: modal.description.trim() || undefined,
      genre: modal.genre.trim() || undefined,
      artists: modal.artists.split(',').map((s) => s.trim()).filter(Boolean).length
        ? modal.artists.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined,
      tags: modal.tags.split(',').map((s) => s.trim()).filter(Boolean).length
        ? modal.tags.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined,
      coverUrl: modal.coverUrl.trim() || undefined,
      status: modal.status,
      createdBy: modal.editing?.createdBy || '',
    };
    setSavingVersion(true);
    setZipError(null);
    try {
      if (modal.editing) {
        await onSave(modal.editing.id, payload);
        if (modal.active) {
          await deactivateOverlapping(modal.editing, modal.trackIds);
        }
        if (modal.zipFile) {
          publishZip({ ...modal.editing, ...payload } as Project, modal.zipFile, modal.trackIds);
        }
      } else {
        const id = await onSave(null, { ...payload, createdBy: '' });
        if (id) {
          const saved = { id, ...payload } as Project;
          if (modal.active) await deactivateOverlapping(null, modal.trackIds);
          if (modal.zipFile) publishZip(saved, modal.zipFile, modal.trackIds);
        }
      }
      setModal(null);
    } finally {
      setSavingVersion(false);
    }
  };

  const setActive = async (version: Project) => {
    for (const p of projects) {
      if (p.id !== version.id && p.active && overlap(projectTrackIds(p), projectTrackIds(version))) {
        await onSave(p.id, { ...p, active: false } as Omit<Project, 'id' | 'createdAt' | 'updatedAt'>);
      }
    }
    await onSave(version.id, { ...version, active: true } as Omit<Project, 'id' | 'createdAt' | 'updatedAt'>);
  };

  const releaseTitle = (r: Release) => (r.kind === 'album' ? `сборник «${r.title}»` : `трек «${r.title}»`);

  const renderZipSection = (p: Project) => {
    if (uploadingId === p.id || p.zipStatus === 'uploading') {
      return (
        <div className="project-zip project-zip-uploading">
          <span className="project-zip-spinner" /> Загружаем архив версии в Archive.org…
        </div>
      );
    }
    if (p.zipStatus === 'error' || p.zipError) {
      return (
        <div className="project-zip project-zip-error">
          <span>{p.zipError || 'Ошибка публикации'}</span>
          <button type="button" className="btn-small-ghost" onClick={() => setModal({
            ...emptyForm(projectTrackIds(p), p.name),
            editing: p,
            variant: p.variant || 'main',
            vocalType: p.vocalType || '',
            daw: p.daw || 'fl',
            dawVersion: p.dawVersion || '',
            stage: p.stage || 'mixing',
            active: !!p.active,
            description: p.description || '',
            genre: p.genre || '',
            tags: (p.tags || []).join(', '),
            artists: (p.artists || []).join(', '),
            coverUrl: p.coverUrl || '',
            status: p.status || 'draft',
          })}>
            Заменить
          </button>
        </div>
      );
    }
    if (p.zipUrl) {
      return (
        <div className="project-zip project-zip-ready">
          <span className="project-zip-ok">✓</span>
          <a href={p.zipUrl} target="_blank" rel="noreferrer">
            Скачать архив версии
          </a>
          <button type="button" className="btn-small-ghost" onClick={() => setModal({
            ...emptyForm(projectTrackIds(p), p.name),
            editing: p,
            variant: p.variant || 'main',
            vocalType: p.vocalType || '',
            daw: p.daw || 'fl',
            dawVersion: p.dawVersion || '',
            stage: p.stage || 'mixing',
            active: !!p.active,
            description: p.description || '',
            genre: p.genre || '',
            tags: (p.tags || []).join(', '),
            artists: (p.artists || []).join(', '),
            coverUrl: p.coverUrl || '',
            status: p.status || 'draft',
          })}>
            Заменить
          </button>
        </div>
      );
    }
    return null;
  };

  const openNewVersion = (r?: Release) => {
    setModal(emptyForm(r ? releaseTrackIds(r) : [], r ? r.title : ''));
  };

  const openEditVersion = (p: Project) => {
    setModal({
      ...emptyForm(projectTrackIds(p), p.name),
      editing: p,
      variant: p.variant || 'main',
      vocalType: (p.vocalType || '') as ProjectVocalType | '',
      daw: p.daw || 'fl',
      dawVersion: p.dawVersion || '',
      stage: p.stage || 'mixing',
      active: !!p.active,
      description: p.description || '',
      genre: p.genre || '',
      tags: (p.tags || []).join(', '),
      artists: (p.artists || []).join(', '),
      coverUrl: p.coverUrl || '',
      status: p.status || 'draft',
    });
  };

  return (
    <div className="projects-view">
      <div className="beats-head">
        <h2>Проекты</h2>
        <div className="projects-head-actions">
          <button className="btn-primary" onClick={() => openNewVersion()}>
            + Новая версия
          </button>
        </div>
      </div>

      {zipError && <div className="error-msg">{zipError}</div>}

      {releases.length === 0 ? (
        <div className="beats-empty">
          Релизов пока нет. Создайте треки — релиз (сингл или сборник) появится здесь автоматически,
          и к нему можно будет добавлять версии проектов.
        </div>
      ) : (
        <div className="projects-grid">
          {releases.map((r) => {
            const versions = versionsFor(r);
            const activeVersion = versions.find((v) => v.active) || versions[0];
            const stage = releaseStageLabel(r.tracks);
            const coverSrc = (activeVersion && activeVersion.coverUrl) || r.cover;
            const metaVersion = activeVersion && (activeVersion.description || activeVersion.genre || (activeVersion.tags && activeVersion.tags.length > 0))
              ? activeVersion
              : undefined;
            return (
              <div className="release-card" key={r.id}>
                <div className="release-card-cover">
                  {coverSrc ? (
                    <img src={coverSrc} alt="" />
                  ) : (
                    <span className="release-cover-fallback">
                      {r.title.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="release-card-body">
                  <div className="release-card-header">
                    <span className="release-card-title" title={r.title}>{r.title}</span>
                    <span className="column-count">{r.tracks.length}</span>
                  </div>
                  <div className="release-card-meta">
                    <span className="beat-chip">{r.kind === 'album' ? 'Сборник' : 'Сингл'}</span>
                    {stage && <span className="beat-chip">{stage}</span>}
                    {activeVersion && (
                      <span className="beat-chip release-active-chip">Активная версия</span>
                    )}
                  </div>

                  {metaVersion && (
                    <div className="project-card-info">
                      {metaVersion.description && <div className="project-card-desc">{metaVersion.description}</div>}
                      <div className="project-card-tags">
                        {metaVersion.genre && <span className="beat-chip">{metaVersion.genre}</span>}
                        {(metaVersion.tags || []).map((t) => (
                          <span key={t} className="beat-chip">#{t}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {r.tracks.length > 0 && (
                    <div className="release-tracks">
                      {r.tracks.slice(0, 5).map((t) => (
                        <div className="project-track-row" key={t.id}>
                          <span className="project-track-title">
                            {t.trackNumber ? `${t.trackNumber}. ` : ''}
                            {t.title}
                          </span>
                          <span className="project-track-meta">
                            {asArray(t.artists).map((a) => String(a)).filter(Boolean)[0] ||
                              userMap.get(t.artistUids?.[0] || '')?.artistName ||
                              ''}
                          </span>
                        </div>
                      ))}
                      {r.tracks.length > 5 && (
                        <div className="project-card-empty">и ещё {r.tracks.length - 5}…</div>
                      )}
                    </div>
                  )}

                  <div className="project-card-section-title">Версии ({versions.length})</div>
                  {versions.length === 0 ? (
                    <div className="project-card-empty">
                      Версий пока нет. Создайте первую, чтобы сводить/мастерить этот релиз.
                    </div>
                  ) : (
                    <div className="release-versions">
                      {versions.map((p) => {
                        const chips = [
                          p.variant ? PROJECT_VARIANT_LABELS[p.variant] : '',
                          p.vocalType ? PROJECT_VOCAL_TYPE_LABELS[p.vocalType] : '',
                          p.daw ? PROJECT_DAW_LABELS[p.daw] : '',
                          p.dawVersion ? `v${p.dawVersion}` : '',
                          p.stage ? PROJECT_STAGE_LABELS[p.stage] : '',
                        ].filter(Boolean);
                        return (
                          <div className={`release-version ${p.active ? 'release-version-active' : ''}`} key={p.id}>
                            <div className="release-version-head">
                              <span className="release-version-name" title={p.name}>{p.name}</span>
                              {p.active && <span className="beat-chip release-active-chip">активная</span>}
                              {canEdit && (
                                <div className="release-version-actions">
                                  {!p.active && (
                                    <button type="button" className="btn-small-ghost" onClick={() => void setActive(p)}>
                                      Сделать активной
                                    </button>
                                  )}
                                  <button type="button" className="btn-small-ghost" onClick={() => openEditVersion(p)}>
                                    Изменить
                                  </button>
                                  <button
                                    type="button"
                                    className="at-delete"
                                    title="Удалить версию"
                                    disabled={deletingId === p.id}
                                    onClick={() => {
                                      if (!window.confirm(`Удалить версию «${p.name}»?`)) return;
                                      setDeletingId(p.id);
                                      void onDelete(p.id).finally(() => setDeletingId(null));
                                    }}
                                  >
                                    ×
                                  </button>
                                </div>
                              )}
                            </div>
                            {chips.length > 0 && (
                              <div className="release-version-chips">
                                {chips.map((c) => <span className="beat-chip" key={c}>{c}</span>)}
                              </div>
                            )}
                            <div className="release-version-zip">
                              {renderZipSection(p)}
                              {!p.zipUrl && p.zipStatus !== 'uploading' && p.zipStatus !== 'error' && canEdit && (
                                <button
                                  type="button"
                                  className="btn-small-ghost"
                                  onClick={() => openEditVersion(p)}
                                >
                                  ⬆ Прикрепить архив версии (.zip)
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {canEdit && (
                    <button type="button" className="btn-add-inline" onClick={() => openNewVersion(r)}>
                      + Новая версия для {releaseTitle(r)}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="track-form-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{modal.editing ? 'Редактировать версию' : 'Новая версия проекта'}</h2>
              <button className="modal-close" onClick={() => setModal(null)}>×</button>
            </div>

            <div className="form-section">
              <div className="form-group">
                <label>Название версии</label>
                <input
                  type="text"
                  value={modal.name}
                  onChange={(e) => setModal({ ...modal, name: e.target.value })}
                  placeholder="Название, например: название релиза или «Основа»"
                />
              </div>

              <div className="form-group">
                <label>Релизы, которые обслуживает версия *</label>
                <div className="release-multiselect">
                  {releases.map((r) => {
                    const rid = releaseTrackIds(r);
                    const checked = rid.some((id) => modal.trackIds.includes(id));
                    const toggle = () => {
                      const next = new Set(modal.trackIds);
                      if (checked) {
                        for (const id of rid) next.delete(id);
                      } else {
                        for (const id of rid) next.add(id);
                      }
                      setModal({ ...modal, trackIds: Array.from(next) });
                    };
                    return (
                      <label className="release-option" key={r.id}>
                        <input type="checkbox" checked={checked} onChange={toggle} />
                        <span className={`release-option-title ${checked ? 'checked' : ''}`}>
                          {r.title}
                        </span>
                        <span className="beat-chip">{r.kind === 'album' ? 'сборник' : 'сингл'}</span>
                      </label>
                    );
                  })}
                  {releases.length === 0 && (
                    <div className="project-card-empty">Сначала создайте хотя бы один трек.</div>
                  )}
                </div>
                {modal.trackIds.length > 0 && (
                  <div className="form-hint" style={{ marginTop: 4 }}>
                    Выбрано релизов: {releases.filter((x) => releaseTrackIds(x).some((id) => modal.trackIds.includes(id))).length}
                  </div>
                )}
              </div>

              <h3>Доп. информация релиза</h3>
              <div className="form-row">
                <div className="form-group">
                  <label>Статус</label>
                  <select
                    value={modal.status}
                    onChange={(e) => setModal({ ...modal, status: e.target.value as TrackStatus })}
                  >
                    {Object.entries(STATUS_LABELS).map(([id, label]) => (
                      <option key={id} value={id}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Жанр</label>
                  <input
                    type="text"
                    value={modal.genre}
                    onChange={(e) => setModal({ ...modal, genre: e.target.value })}
                    placeholder="Hip-Hop"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Артисты (через запятую)</label>
                  <input
                    type="text"
                    value={modal.artists}
                    onChange={(e) => setModal({ ...modal, artists: e.target.value })}
                    placeholder="Основные исполнители релиза"
                  />
                </div>
                <div className="form-group">
                  <label>Теги (через запятую)</label>
                  <input
                    type="text"
                    value={modal.tags}
                    onChange={(e) => setModal({ ...modal, tags: e.target.value })}
                    placeholder="dark, концепт, альбом"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Обложка (ссылка)</label>
                <input
                  type="url"
                  value={modal.coverUrl}
                  onChange={(e) => setModal({ ...modal, coverUrl: e.target.value })}
                  placeholder="https://…/cover.jpg"
                />
              </div>
              <div className="form-group">
                <label>Описание</label>
                <textarea
                  value={modal.description}
                  onChange={(e) => setModal({ ...modal, description: e.target.value })}
                  placeholder="Пара слов о релизе: задача, идея, детали"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Вариант</label>
                  <select
                    value={modal.variant}
                    onChange={(e) => setModal({ ...modal, variant: e.target.value as ProjectVariant })}
                  >
                    <option value="main">{PROJECT_VARIANT_LABELS.main}</option>
                    <option value="other">{PROJECT_VARIANT_LABELS.other}</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Вокал / материал</label>
                  <select
                    value={modal.vocalType}
                    onChange={(e) => setModal({ ...modal, vocalType: e.target.value as ProjectVocalType | '' })}
                  >
                    <option value="">—</option>
                    {PROJECT_VOCAL_TYPES.map((v) => (
                      <option key={v} value={v}>{PROJECT_VOCAL_TYPE_LABELS[v]}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>DAW</label>
                  <select
                    value={modal.daw}
                    onChange={(e) => {
                      const daw = e.target.value as ProjectDaw;
                      setModal({
                        ...modal,
                        daw,
                        dawVersion: daw === 'fl' && !modal.dawVersion ? DEFAULT_DLD_VERSION : modal.dawVersion,
                      });
                    }}
                  >
                    <option value="fl">{PROJECT_DAW_LABELS.fl}</option>
                    <option value="trackout">{PROJECT_DAW_LABELS.trackout}</option>
                    <option value="other">{PROJECT_DAW_LABELS.other}</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Версия DAW</label>
                  <input
                    type="text"
                    value={modal.dawVersion}
                    onChange={(e) => setModal({ ...modal, dawVersion: e.target.value })}
                    placeholder={modal.daw === 'fl' ? DEFAULT_DLD_VERSION : 'Например: 15, 21'}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Этап</label>
                  <select
                    value={modal.stage}
                    onChange={(e) => setModal({ ...modal, stage: e.target.value as ProjectStage })}
                  >
                    {PROJECT_STAGES.map((s) => (
                      <option key={s} value={s}>{PROJECT_STAGE_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Активная версия</label>
                  <select value={modal.active ? '1' : '0'} onChange={(e) => setModal({ ...modal, active: e.target.value === '1' })}>
                    <option value="1">Да (главная)</option>
                    <option value="0">Нет</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Архив версии (.zip, до 1 ГБ) — можно прикрепить позже</label>
                <input
                  type="file"
                  accept=".zip"
                  onChange={(e) => setModal({ ...modal, zipFile: e.target.files?.[0] || null })}
                />
                {modal.zipFile && (
                  <div className="form-hint" style={{ marginTop: 4 }}>
                    Архив «{modal.zipFile.name}» ({(modal.zipFile.size / 1024 / 1024).toFixed(1)} МБ)
                    будет загружен в Archive.org после сохранения.
                  </div>
                )}
              </div>

              <div className="form-hint">
                Одна запись = одна версия. Версии можно назначать сразу нескольким релизам,
                чтобы не дублировать одинаковую работу в разных альбомах.
              </div>
            </div>

            <div className="modal-footer">
              {modal.editing && (
                <span className="release-version-zip">
                  {renderZipSection(modal.editing)}
                </span>
              )}
              <button className="btn-secondary" onClick={() => setModal(null)}>Отмена</button>
              <button
                className="btn-primary"
                disabled={savingVersion}
                onClick={() => void saveVersion()}
              >
                {savingVersion ? 'Сохраняем…' : modal.editing ? 'Сохранить' : 'Создать версию'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}