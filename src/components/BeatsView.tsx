import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BEAT_KEY_OPTIONS,
  BEAT_GENRE_OPTIONS,
  type Beat,
  type BeatStatus,
  type BeatFormData,
} from '../types/beat';
import { detectPlatform, type PlatformKind } from '../types/track';
import { useShippedPlayerManager } from './ShippedPlayer';
import { uploadBeatAudio, checkBeatAudioFile } from '../services/archiveService';

const FALLBACK_COVER = `${import.meta.env.BASE_URL}logo_vtg_default.jpg`;

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
  onSave: (id: string | null, data: BeatFormData) => Promise<void>;
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
  };
}

function BeatFormModal({
  initial,
  saving,
  creatorName,
  onCancel,
  onSubmit,
}: {
  initial: BeatFormState;
  saving: boolean;
  creatorName: string;
  onCancel: () => void;
  onSubmit: (f: BeatFormState) => Promise<void>;
}) {
  const [f, setF] = useState<BeatFormState>(initial);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<'idle' | 'upload' | 'verify'>('idle');

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
      setStage('upload');
      try {
        const up = await uploadBeatAudio({
          file: audioFile,
          title: f.title.trim(),
          description: f.description.trim() || undefined,
          creator: creatorName,
        });
        setStage('verify');
        const next = { ...f, platformUrl: up.url };
        setF(next);
        await onSubmit(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Загрузка не удалась');
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
            После сохранения бит сразу публикуется на сайте. Если прикрепили файл, через пару минут он появится в Archive.org со ссылкой.
          </p>
        </div>

        <div className="form-actions">
          {error && <span className="form-error">{error}</span>}
          <button className="btn-secondary" onClick={onCancel} disabled={busy}>Отмена</button>
          <button className="btn-primary" onClick={submit} disabled={busy}>
            {stage === 'upload'
              ? 'Загружаем в Archive.org…'
              : stage === 'verify'
                ? 'Проверяем и публикуем…'
                : saving
                  ? 'Сохраняем…'
                  : 'Сохранить'}
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
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const autoPlayedRef = useRef(false);

  useEffect(() => {
    if (!autoPlayId || autoPlayedRef.current) return;
    const b = beats.find((x) => x.id === autoPlayId);
    if (!b) return;
    autoPlayedRef.current = true;
    if (beatPlayable(b)) manager.playTrack(b.id);
  }, [beats, autoPlayId, manager]);

  const baseUrl = window.location.origin + import.meta.env.BASE_URL;

  const copyLink = async (id: string) => {
    try {
      await navigator.clipboard.writeText(`${baseUrl}#beat=${id}`);
      setCopiedId(id);
      if (copiedId !== id) {
        setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
      }
    } catch {
      /* ignore */
    }
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return beats.filter((b) => {
      if (filter === 'mine' && b.beatmakerUid !== currentUid) return false;
      if (q) {
        const hay = [b.title, b.genre || '', b.beatmakerName || '', (b.tags || []).join(' ')]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [beats, filter, query, currentUid]);

  const canManage = (b: Beat) => canEdit && (isAdmin || b.beatmakerUid === currentUid);

  const save = async (f: BeatFormState) => {
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
        beatmakerUid: currentUid,
        beatmakerName: currentName,
        createdBy: currentUid,
      });
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
      </div>

      {visible.length === 0 ? (
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
                <div className="beat-cover-wrap">
                  <img className="beat-cover" src={b.coverUrl?.trim() || FALLBACK_COVER} alt="" />
                  {b.free && <span className="beat-badge-free">FREE</span>}
                  {b.status === 'hidden' && <span className="beat-badge-hidden">Скрыт</span>}
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
                <div className="beat-card-body">
                  <div className="beat-card-title">{b.title}</div>
                  <div className="beat-card-meta">
                    {!!b.bpm && <span className="beat-chip">{b.bpm} BPM</span>}
                    {!!b.key && <span className="beat-chip">{b.key}</span>}
                    {!!b.genre && <span className="beat-chip">{b.genre}</span>}
                  </div>
                  <div className="beat-card-sub">
                    <span>{b.beatmakerName || 'Битмейкер'}</span>
                    <span className="beat-platform">{PLATFORM_LABELS[beatPlatform(b)]}</span>
                  </div>
                  {!!(b.tags && b.tags.length) && (
                    <div className="beat-tags">
                      {b.tags!.map((t) => (
                        <span key={t} className="beat-tag">#{t}</span>
                      ))}
                    </div>
                  )}
                  {le && (
                    <div className="beat-card-actions">
                      <button
                        type="button"
                        className="btn-small-ghost"
                        onClick={() => setForm(toFormState(b))}
                      >
                        Редактировать
                      </button>
                      <button
                        type="button"
                        className="btn-small-ghost"
                        title="Скопировать ссылку на бит"
                        onClick={() => copyLink(b.id)}
                      >
                        {copiedId === b.id ? 'Ссылка ✓' : 'Ссылка'}
                      </button>
                      <button
                        type="button"
                        className="btn-small-ghost btn-danger"
                        disabled={deletingId === b.id}
                        onClick={() => remove(b.id)}
                      >
                        Удалить
                      </button>
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
          creatorName={currentName}
          onCancel={() => setForm(null)}
          onSubmit={save}
        />
      )}
    </div>
  );
}