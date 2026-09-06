import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BEAT_KEY_OPTIONS,
  BEAT_GENRE_OPTIONS,
  type Beat,
  type BeatStatus,
  type BeatArchiveStatus,
  type BeatFormData,
} from '../types/beat';
import { detectPlatform, type PlatformKind } from '../types/track';
import { useShippedPlayerManager, shippedFromUrl } from './ShippedPlayer';
import { PlatformPlayer } from './TracksListView';
import { checkBeatAudioFile } from '../services/archiveService';
import { listCachedAudio, deleteCachedAudio, clearAudioCache, onAudioCacheChange } from '../services/audioCacheService';

const FALLBACK_COVER = `${import.meta.env.BASE_URL}logo_vtg_default.jpg`;

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

const PLATFORM_LABELS: Record<PlatformKind, string> = {
  soundcloud: 'SoundCloud',
  youtube: 'YouTube',
  yandex: 'Яндекс Музыка',
  vkontakte: 'VK',
  audio: 'Аудио-файл',
  other: 'Ссылка',
};

function beatPlatform(b: Beat): PlatformKind {
  if (b.platform) return b.platform;
  return b.platformUrl ? detectPlatform(b.platformUrl) : 'other';
}

function beatPlayable(b: Beat): boolean {
  const k = beatPlatform(b);
  return k === 'soundcloud' || k === 'youtube' || k === 'audio';
}

interface BeatsViewProps {
  beats: Beat[];
  currentUid: string;
  currentName: string;
  canEdit: boolean;
  isAdmin: boolean;
  autoPlayId?: string;
  onSave: (id: string | null, data: BeatFormData, file?: File) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

interface BeatFormState {
  id: string | null;
  title: string;
  bpm: string;
  key: string;
  genre: string;
  tags: string;
  description: string;
  coverUrl: string;
  platformUrl: string;
  status: BeatStatus;
  free: boolean;
  collection: string;
  collectionNumber: string;
  archiveStatus?: BeatArchiveStatus;
}

const EMPTY_FORM: BeatFormState = {
  id: null,
  title: '',
  bpm: '',
  key: '',
  genre: '',
  tags: '',
  description: '',
  coverUrl: '',
  platformUrl: '',
  status: 'published',
  free: false,
  collection: '',
  collectionNumber: '',
  archiveStatus: 'ready',
};

function toFormState(b: Beat): BeatFormState {
  return {
    id: b.id,
    title: b.title,
    bpm: b.bpm ? String(b.bpm) : '',
    key: b.key || '',
    genre: b.genre || '',
    tags: (b.tags || []).join(', '),
    description: b.description || '',
    coverUrl: b.coverUrl || '',
    platformUrl: b.platformUrl || '',
    status: b.status,
    free: !!b.free,
    collection: b.collection || '',
    collectionNumber: b.collectionNumber ? String(b.collectionNumber) : '',
    archiveStatus: b.archiveStatus || 'ready',
  };
}

function BeatFormModal({
  initial,
  saving,
  collections,
  onCancel,
  onSubmit,
}: {
  initial: BeatFormState;
  saving: boolean;
  collections: string[];
  onCancel: () => void;
  onSubmit: (f: BeatFormState, file?: File) => Promise<void>;
}) {
  const [f, setF] = useState<BeatFormState>(initial);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<'idle' | 'saving'>('idle');

  const kind = detectPlatform(f.platformUrl.trim());
  const linkPlayable = kind === 'soundcloud' || kind === 'youtube' || kind === 'audio';

  const submit = async () => {
    setError(null);
    if (!f.title.trim()) {
      setError('Укажите название бита');
      return;
    }
    if (audioFile) {
      const fileErr = checkBeatAudioFile(audioFile);
      if (fileErr) {
        setError(fileErr);
        return;
      }
      setStage('saving');
      try {
        // Карточка сохраняется сразу (без ссылки), публикация mp3 идёт в фоне
        const next = { ...f, platformUrl: '', archiveStatus: 'uploading' as const };
        await onSubmit(next, audioFile);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Не удалось сохранить бит');
      } finally {
        setStage('idle');
      }
      return;
    }
    if (!f.platformUrl.trim()) {
      setError('Прикрепите mp3 или укажите ссылку на аудио');
      return;
    }
    if (!linkPlayable) {
      setError(
        'Ссылка не распознана. Укажите SoundCloud, YouTube или прямой файл (mp3/wav/ogg)'
      );
      return;
    }
    await onSubmit(f);
  };

  const set = (patch: Partial<BeatFormState>) => setF((prev) => ({ ...prev, ...patch }));
  const busy = saving || stage !== 'idle';

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setAudioFile(file);
    if (file && !f.title.trim()) {
      const base = file.name.replace(/\.[^.]+$/, '');
      set({ title: base });
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="track-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{initial.id ? 'Редактировать бит' : 'Новый бит'}</h2>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>

        <div className="form-section">
          <div className="form-group">
            <label>Название *</label>
            <input
              type="text"
              value={f.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="Например: VTG – Burner"
            />
          </div>

          <div className="form-group">
            <label>Аудио *</label>
            <input
              type="file"
              accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus"
              onChange={onFileChange}
            />
            <span className="beat-link-hint">
              {audioFile
                ? `Выбран: ${audioFile.name} — опубликуется в Archive.org автоматически`
                : 'Прикрепите mp3 (до 30 МБ): сам опубликуется в Archive.org'}
            </span>
          </div>

          <div className="form-group">
            <label>Или ссылка на уже загруженное аудио</label>
            <input
              type="text"
              value={f.platformUrl}
              onChange={(e) => set({ platformUrl: e.target.value })}
              placeholder="SoundCloud, YouTube или прямой mp3/wav/ogg"
            />
            {f.platformUrl.trim() && (
              <span className={`beat-link-hint ${linkPlayable ? 'ok' : 'bad'}`}>
                {linkPlayable
                  ? `Воспроизведение: ${PLATFORM_LABELS[kind]}`
                  : 'Не распознано как аудио'}
              </span>
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>BPM</label>
              <input
                type="number"
                min={30}
                max={300}
                value={f.bpm}
                onChange={(e) => set({ bpm: e.target.value })}
                placeholder="140"
              />
            </div>
            <div className="form-group">
              <label>Тональность</label>
              <select value={f.key} onChange={(e) => set({ key: e.target.value })}>
                <option value="">—</option>
                {BEAT_KEY_OPTIONS.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Жанр</label>
            <input
              type="text"
              list="beat-genres"
              value={f.genre}
              onChange={(e) => set({ genre: e.target.value })}
              placeholder="Hip-Hop"
            />
            <datalist id="beat-genres">
              {BEAT_GENRE_OPTIONS.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>

          <div className="form-group">
            <label>Теги (через запятую)</label>
            <input
              type="text"
              value={f.tags}
              onChange={(e) => set({ tags: e.target.value })}
              placeholder="dark, bass, 808"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Сборник</label>
              <div className="collection-input-row">
                <select value={f.collection} onChange={(e) => set({ collection: e.target.value })}>
                  <option value="">Нет сборника</option>
                  {collections.map((c) => <option key={c} value={c}>{c}</option>)}
                  {f.collection && !collections.includes(f.collection) && <option value={f.collection}>{f.collection}</option>}
                </select>
                <button
                  type="button"
                  className="btn-small-ghost"
                  title="Создать новый сборник и назначить его этому биту"
                  onClick={() => {
                    const name = window.prompt('Название нового сборника:');
                    if (name && name.trim()) set({ collection: name.trim() });
                  }}
                >
                  Новый сборник
                </button>
              </div>
            </div>
            {f.collection && (
              <div className="form-group">
                <label>№ в сборнике</label>
                <input
                  type="number"
                  min={1}
                  value={f.collectionNumber}
                  onChange={(e) => set({ collectionNumber: e.target.value })}
                  placeholder="1"
                />
              </div>
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Обложка (ссылка)</label>
              <input
                type="text"
                value={f.coverUrl}
                onChange={(e) => set({ coverUrl: e.target.value })}
                placeholder="https://…/cover.jpg"
              />
            </div>
            <div className="form-group">
              <label>Статус</label>
              <select value={f.status} onChange={(e) => set({ status: e.target.value as BeatStatus })}>
                <option value="published">Опубликован</option>
                <option value="hidden">Скрыт</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Описание</label>
            <textarea
              value={f.description}
              onChange={(e) => set({ description: e.target.value })}
              placeholder="Пара слов о бите"
            />
          </div>

          <label className="beat-check">
            <input
              type="checkbox"
              checked={f.free}
              onChange={(e) => set({ free: e.target.checked })}
            />
            Бесплатное использование
          </label>
          <p className="beat-publish-hint">
            Если прикрепили mp3 — карточка сохранится сразу, а звук опубликуется в Archive.org в фоне (можно грузить несколько подряд).
          </p>
        </div>

        <div className="form-actions">
          {error && <span className="form-error">{error}</span>}
          <button className="btn-secondary" onClick={onCancel} disabled={busy}>Отмена</button>
          <button className="btn-primary" onClick={submit} disabled={busy}>
            {saving || stage === 'saving' ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BeatsView({
  beats,
  currentUid,
  currentName,
  canEdit,
  isAdmin,
  autoPlayId,
  onSave,
  onDelete,
}: BeatsViewProps) {
  const manager = useShippedPlayerManager();
  const [filter, setFilter] = useState<'all' | 'mine'>('all');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<BeatFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [tab, setTab] = useState<'beats' | 'collections'>('beats');
  const autoPlayedRef = useRef(false);
  const [cached, setCached] = useState<{ ids: Set<string>; bytes: number }>({
    ids: new Set(),
    bytes: 0,
  });

  const refreshCache = useCallback(async () => {
    try {
      const list = await listCachedAudio();
      setCached({
        ids: new Set(list.map((r) => r.id)),
        bytes: list.reduce((s, r) => s + (r.size || 0), 0),
      });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshCache();
    return onAudioCacheChange(() => void refreshCache());
  }, [refreshCache]);

  const removeCached = async (id: string) => {
    await deleteCachedAudio(id);
  };

  const clearCache = async () => {
    if (cached.ids.size === 0) return;
    if (!window.confirm(`Удалить из локального кэша все ${cached.ids.size} трек(ов)?`)) return;
    await clearAudioCache();
  };

  useEffect(() => {
    if (!autoPlayId || autoPlayedRef.current) return;
    const b = beats.find((x) => x.id === autoPlayId);
    if (!b) return;
    autoPlayedRef.current = true;
    if (beatPlayable(b)) manager.playTrack(b.id);
  }, [beats, autoPlayId, manager]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return beats.filter((b) => {
      if (tab === 'collections' && !b.collection) return false;
      if (filter === 'mine' && b.beatmakerUid !== currentUid) return false;
      if (q) {
        const hay = [b.title, b.genre || '', b.beatmakerName || '', (b.tags || []).join(' '), b.collection || '']
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [beats, filter, query, currentUid, tab]);

  const collections = useMemo(() => {
    const names = new Set<string>();
    for (const b of beats) if (b.collection) names.add(b.collection);
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [beats]);

  // Плеер: пока раздел «Биты» открыт (без режима (All)) играть только из текущей выборки
  const scopeItems = useMemo(
    () => visible.map((b) => shippedFromUrl(b.id, b.title, b.platformUrl || '', b.coverUrl, b.status === 'published', 'beat')),
    [visible]
  );
  useEffect(() => {
    manager.setScope(scopeItems);
  }, [scopeItems, manager]);

  const groupedCollections = useMemo(() => {
    const map = new Map<string, Beat[]>();
    for (const b of visible) {
      const key = b.collection || '';
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    }
    const out: { name: string; beats: Beat[] }[] = [];
    for (const [name, items] of map) {
      items.sort((a, b) => (a.collectionNumber || 0) - (b.collectionNumber || 0));
      out.push({ name, beats: items });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [visible]);

  const canManage = (b: Beat) => canEdit && (isAdmin || b.beatmakerUid === currentUid);

  const save = async (f: BeatFormState, file?: File) => {
    setSaving(true);
    try {
      const platformUrl = f.platformUrl.trim();
      const kind = detectPlatform(platformUrl);
      const platform: PlatformKind | undefined =
        kind === 'soundcloud' || kind === 'youtube' || kind === 'audio' ? kind : undefined;
      await onSave(f.id, {
        title: f.title.trim(),
        bpm: f.bpm.trim() ? Number(f.bpm) : null,
        key: f.key.trim() || undefined,
        genre: f.genre.trim() || undefined,
        tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
        description: f.description.trim() || undefined,
        coverUrl: f.coverUrl.trim() || undefined,
        platformUrl,
        platform,
        status: f.status,
        free: f.free,
        collection: f.collection.trim() || undefined,
        collectionNumber: f.collectionNumber.trim() ? Number(f.collectionNumber) : undefined,
        beatmakerUid: currentUid,
        beatmakerName: currentName,
        createdBy: currentUid,
        archiveStatus: f.archiveStatus || (file ? 'uploading' : 'ready'),
      }, file);
      setForm(null);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (deletingId) return;
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="beats-view">
      <div className="beats-head">
        <h2>Биты</h2>
        <div className="beats-filters">
          <button
            type="button"
            className={`beat-filter ${tab === 'beats' ? 'active' : ''}`}
            onClick={() => setTab('beats')}
          >
            Биты
          </button>
          <button
            type="button"
            className={`beat-filter ${tab === 'collections' ? 'active' : ''}`}
            onClick={() => setTab('collections')}
          >
            Сборники
          </button>
        </div>
        <input
          className="beats-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по названию, жанру, тегам…"
        />
        <div className="beats-filters">
          <button
            type="button"
            className={`beat-filter ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            Все
          </button>
          <button
            type="button"
            className={`beat-filter ${filter === 'mine' ? 'active' : ''}`}
            onClick={() => setFilter('mine')}
          >
            Мои биты
          </button>
        </div>
        {canEdit && (
          <button className="btn-primary" onClick={() => setForm(EMPTY_FORM)}>
            + Добавить бит
          </button>
        )}
        <button
          type="button"
          className="btn-secondary"
          disabled={cached.ids.size === 0}
          onClick={clearCache}
          title="Удалить все скачанные аудио с устройства"
        >
          Очистить кэш{cached.bytes > 0 ? ` (${cached.ids.size} · ${formatBytes(cached.bytes)})` : ''}
        </button>
      </div>

      {tab === 'collections' ? (
        groupedCollections.length === 0 ? (
          <div className="beats-empty">
            {beats.length === 0
              ? 'Битов пока нет. Добавьте первый бит по ссылке на SoundCloud, YouTube или прямой аудио-файл.'
              : 'Сборников пока нет. Назначьте битам сборник при редактировании.'}
          </div>
        ) : (
          <div className="albums-grid">
            {groupedCollections.map((c) => {
              const cover =
                c.beats.find((b) => b.coverUrl)?.coverUrl || FALLBACK_COVER;
              return (
                <div className="album-card album-card-editable" key={c.name}>
                  <div className="album-cover-full">
                    <img className="album-cover" src={cover} alt="" />
                  </div>
                  <div className="album-header">
                    <div className="album-links-row">
                      <a className="album-title" title={c.name}>{c.name}</a>
                    </div>
                    <div className="album-subtitle">{c.beats.length} бит(ов)</div>
                  </div>
                  <div className="album-tracklist">
                    {c.beats.map((b, i) => (
                      <div
                        className="album-track-row"
                        key={b.id}
                        onClick={() => {
                          if (beatPlayable(b)) manager.playTrack(b.id);
                        }}
                      >
                        <span className="at-num">{i + 1}</span>
                        <span className="at-title">{b.title}</span>
                        <span className="at-artists">{b.beatmakerName || 'Битмейкер'}</span>
                        {beatPlatform(b) === 'audio' && b.platformUrl && (
                          <a
                            className="at-download"
                            href={b.platformUrl}
                            download
                            title="Скачать аудио"
                            onClick={(e) => e.stopPropagation()}
                          >
                            ⬇
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                  {canManage(c.beats[0]) && (
                    <div className="album-actions">
                      <button
                        type="button"
                        className="btn-small-ghost"
                        onClick={() => setForm(toFormState(c.beats[0]))}
                      >
                        Редактировать сборник
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : visible.length === 0 ? (
        <div className="beats-empty">
          {beats.length === 0
            ? 'Битов пока нет. Добавьте первый бит по ссылке на SoundCloud, YouTube или прямой аудио-файл.'
            : 'Ничего не найдено'}
        </div>
      ) : (
        <div className="beats-grid">
          {visible.map((b) => {
            const playable = beatPlayable(b);
            const playing = manager.currentId === b.id && manager.playing;
            const le = canManage(b);
            return (
              <div className="beat-card" key={b.id}>
                <div className="beat-cover-wrap" onClick={le ? () => setForm(toFormState(b)) : undefined}>
                  <img className="beat-cover" src={b.coverUrl?.trim() || FALLBACK_COVER} alt="" />
                  {b.free && <span className="beat-badge-free">FREE</span>}
                  {b.status === 'hidden' && <span className="beat-badge-hidden">Скрыт</span>}
                  {b.archiveStatus === 'error' && (
                    <span
                      className="beat-badge-archive-error"
                      title={b.archiveError || 'Произошла ошибка при публикации звука'}
                    >
                      Ошибка публикации
                    </span>
                  )}
                  {b.archiveStatus === 'uploading' && (
                    <span className="beat-badge-archive">Публикуем…</span>
                  )}
                  {playable && (
                    <button
                      type="button"
                      className={`beat-play ${playing ? 'sp-playing' : ''}`}
                      title={playing ? 'Пауза' : 'Играть'}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (manager.currentId === b.id) manager.togglePlay();
                        else manager.playTrack(b.id);
                      }}
                    >
                      {playing ? '⏸' : '▶'}
                    </button>
                  )}
                </div>
                <div
                  className="beat-card-body beat-card-body-clickable"
                  onClick={le ? () => setForm(toFormState(b)) : undefined}
                >
                  <div className="beat-card-title-row">
                    <span className="beat-card-title">{b.title}</span>
                    {b.collection && (
                      <span className="beat-chip beat-collection-chip" title="Сборник">
                        {b.collection}
                      </span>
                    )}
                    <div className="beat-card-title-actions">
                      {beatPlatform(b) === 'audio' && !!b.platformUrl && (
                        <a
                          className="at-download"
                          href={b.platformUrl}
                          title="Скачать аудио"
                          onClick={(e) => e.stopPropagation()}
                        >
                          ⬇
                        </a>
                      )}
                      {le && (
                        <button
                          type="button"
                          className="at-delete"
                          title="Удалить бит"
                          disabled={deletingId === b.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!window.confirm(`Удалить бит «${b.title}»?`)) return;
                            void remove(b.id);
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="beat-card-tags">
                    {!!b.bpm && <span className="beat-chip">{b.bpm} BPM</span>}
                    {!!b.key && <span className="beat-chip">{b.key}</span>}
                    {!!b.genre && <span className="beat-chip">{b.genre}</span>}
                  </div>
                  <div className="beat-card-sub">
                    <span>{b.beatmakerName || 'Битмейкер'}</span>
                    <span className="beat-platform">{PLATFORM_LABELS[beatPlatform(b)]}</span>
                  </div>
                  {beatPlatform(b) === 'audio' && (
                    <div className="beat-cache-row">
                      {cached.ids.has(b.id) ? (
                        <>
                          <span className="beat-chip beat-cached">✓ В кэше</span>
                          <button
                            type="button"
                            className="btn-small-ghost"
                            title="Удалить этот трек из локального кэша"
                            onClick={(e) => { e.stopPropagation(); void removeCached(b.id); }}
                          >
                            Удалить из кэша
                          </button>
                        </>
                      ) : (
                        <span className="beat-cache-hint">
                          Скачается в кэш автоматически при первом прослушивании
                        </span>
                      )}
                    </div>
                  )}
                  {playable && b.platformUrl && (
                    <div className="beat-card-player" onClick={(e) => e.stopPropagation()}>
                      <PlatformPlayer url={b.platformUrl} compact />
                    </div>
                  )}
                  {!!(b.tags && b.tags.length) && (
                    <div className="beat-tags">
                      {b.tags!.map((t) => (
                        <span key={t} className="beat-tag">#{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {form && (
        <BeatFormModal
          initial={form}
          saving={saving}
          collections={collections}
          onCancel={() => setForm(null)}
          onSubmit={save}
        />
      )}
    </div>
  );
}