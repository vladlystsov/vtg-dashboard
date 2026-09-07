import { useState, useRef } from 'react';
import type { ArtistRole, PlaybackMode, Track } from '../types/track';
import { useAuth } from '../contexts/AuthContext';
import { createArtistRequest } from '../services/artistRequestService';
import { updateMyProfile } from '../services/userService';
import { renameArtistInTracks } from '../services/trackService';
import {
  fetchYouTubeItems,
  fetchSoundCloudItems,
  dedupe,
  findTitleDuplicates,
  persistItems,
  sanitizePlatformUrl,
  parsePlatformLinks,
  type ImportedItem,
} from '../services/platformImportService';

const ROLE_OPTIONS: { id: ArtistRole; label: string }[] = [
  { id: 'artist', label: 'Артист' },
  { id: 'beatmaker', label: 'Битмейкер' },
  { id: 'mixer', label: 'Сведение (mix)' },
  { id: 'feat', label: 'Feat (гость)' },
];

const ROLE_LABELS: Record<ArtistRole, string> = {
  artist: 'Артист',
  beatmaker: 'Битмейкер',
  mixer: 'Сведение',
  feat: 'Гость',
};

export default function ProfileView({ tracks = [] }: { tracks?: Track[] }) {
  const { profile, refreshProfile } = useAuth();
  const [artistName, setArtistName] = useState(profile?.artistName || '');
  const [roles, setRoles] = useState<ArtistRole[]>(profile?.roles || ['artist']);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>(profile?.playbackMode || 'platform');
  const [downloadTracks, setDownloadTracks] = useState(!!profile?.downloadTracks);
  const [skipDuplicates, setSkipDuplicates] = useState(!!profile?.skipDuplicateTitles);
  const [youtubeUrl, setYoutubeUrl] = useState(profile?.youtubeUrl || '');
  const [soundcloudUrl, setSoundcloudUrl] = useState(profile?.soundcloudUrl || '');
  const [linkStatus, setLinkStatus] = useState<Record<string, 'valid' | 'invalid' | 'empty'>>({});
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [dupDialog, setDupDialog] = useState<{ items: ImportedItem[] } | null>(null);
  const [selectedDups, setSelectedDups] = useState<Set<number>>(new Set());
  const dupResolverRef = useRef<((selected: ImportedItem[]) => void) | null>(null);

  // Окно «Были обнаружены дубликаты»: возвращает треки, которые пользователь решил импортировать
  const openDupDialog = (items: ImportedItem[]): Promise<ImportedItem[]> => {
    return new Promise((resolve) => {
      dupResolverRef.current = resolve;
      setSelectedDups(new Set(items.map((_, i) => i)));
      setDupDialog({ items });
    });
  };

  const closeDupDialog = (selected?: ImportedItem[]) => {
    const resolve = dupResolverRef.current;
    dupResolverRef.current = null;
    setDupDialog(null);
    resolve?.(selected || []);
  };

  const toggleDup = (i: number) => {
    setSelectedDups((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const validateLink = (url: string, platform: 'youtube' | 'soundcloud'): 'valid' | 'invalid' | 'empty' => {
    const t = url.trim();
    if (!t) return 'empty';
    // В поле можно вставить сразу несколько ссылок (через запятую или с новой
    // строки) — ссылка считается валидной, если нашлась хотя бы одна.
    const links = parsePlatformLinks(t, platform);
    if (links.length === 0) return 'invalid';
    return 'valid';
  };

  const normalizeChannelUrl = (url: string, platform: 'youtube' | 'soundcloud'): string => {
    const t = url.trim();
    if (!t) return t;
    // приём без протокола: on.soundcloud.com/.., www.soundcloud.com/.., soundcloud.com/..
    const scNoProto = /^(?:on\.|m\.|www\.)?soundcloud\.com\//i;
    const ytNoProto = /^(?:m\.|music\.|www\.)?youtube\.com\//i;
    const ytShortNoProto = /^youtu\.be\//i;
    if (platform === 'soundcloud' && scNoProto.test(t)) return 'https://' + t;
    if (platform === 'youtube' && (ytNoProto.test(t) || ytShortNoProto.test(t))) return 'https://' + t;
    return t;
  };

  const handleUpdateLinks = async () => {
    setMessage('');
    setError('');
    const statuses: Record<string, 'valid' | 'invalid' | 'empty'> = {
      youtube: validateLink(youtubeUrl, 'youtube'),
      soundcloud: validateLink(soundcloudUrl, 'soundcloud'),
    };
    setLinkStatus(statuses);
    const invalidFields: string[] = [];
    if (statuses.youtube === 'invalid') invalidFields.push('YouTube — youtube.com / youtu.be');
    if (statuses.soundcloud === 'invalid') invalidFields.push('SoundCloud — soundcloud.com / on.soundcloud.com');
    if (invalidFields.length > 0) {
      setError(
        `Проверьте ссылку: ${invalidFields.join('; ')}. ` +
          'Можно указать только одну площадку — второе поле оставьте пустым.'
      );
      return;
    }
    // В каждом поле может быть несколько ссылок. Для «канала» в шапке профиля
    // оставляем только первую ссылку, а импортируем сразу все введённые.
    const ytLinks = parsePlatformLinks(youtubeUrl, 'youtube');
    const scLinks = parsePlatformLinks(soundcloudUrl, 'soundcloud');
    const ytAll = youtubeUrl.trim() ? normalizeChannelUrl(sanitizePlatformUrl(youtubeUrl), 'youtube') : '';
    const scAll = soundcloudUrl.trim() ? normalizeChannelUrl(sanitizePlatformUrl(soundcloudUrl), 'soundcloud') : '';
    const yt = ytLinks[0] || '';
    const sc = scLinks[0] || '';
    setSaving(true);
    try {
      await updateMyProfile(profile!.uid, {
        youtubeUrl: yt || '',
        soundcloudUrl: sc || '',
        skipDuplicateTitles: skipDuplicates,
      });
      await refreshProfile();
      if (!yt && !sc) {
        setMessage('Ссылки удалены. Импорт не выполнялся.');
        return;
      }
      setMessage('Ссылки сохранены. Начинаем импорт…');

      setImporting(true);
      const parts: string[] = [];
      const platformErrors: string[] = [];
      const freshAll: ImportedItem[] = [];
      let skippedByUrl = 0;
      let skippedByTitle = 0;

      // Логику дубликатов (по ссылке) не меняем — просто добавляем надстройку
      // по совпадению названий и окно подтверждения.
      const collect = (items: ImportedItem[]) => {
        const { fresh, skipped } = dedupe(items, tracks);
        skippedByUrl += skipped;
        if (skipDuplicates) {
          const titleDups = findTitleDuplicates(fresh, tracks);
          skippedByTitle += titleDups.length;
          freshAll.push(...fresh.filter((it) => !titleDups.includes(it)));
        } else {
          freshAll.push(...fresh);
        }
      };

      if (ytAll) {
        // ytAll может содержать несколько ссылок — parsePlatformLinks внутри fetch сам разберёт список.
        const r = await fetchYouTubeItems(ytAll);
        collect(r.items);
        parts.push(`YouTube: найдено ${r.items.length}`);
        platformErrors.push(...r.warnings.map((w) => `• YouTube: ${w}`));
      }
      if (scAll) {
        const r = await fetchSoundCloudItems(scAll);
        collect(r.items);
        parts.push(`SoundCloud: найдено ${r.items.length}`);
        platformErrors.push(...r.warnings.map((w) => `• SoundCloud: ${w}`));
      }

      // Окно с дубликатами по названию показываем только если кнопка
      // «Не загружать дубликаты названий» выключена.
      const titleDups = skipDuplicates ? [] : findTitleDuplicates(freshAll, tracks);
      const base = freshAll.filter((it) => !titleDups.includes(it));
      let finalItems: ImportedItem[] = base;
      if (titleDups.length > 0) {
        const chosen = await openDupDialog(titleDups);
        skippedByTitle += titleDups.length - chosen.length;
        finalItems = [...base, ...chosen];
      }

      const imported = finalItems.length
        ? await persistItems(finalItems, { uid: profile!.uid, existingTracks: tracks })
        : 0;
      const skippedTotal = skippedByUrl + skippedByTitle;
      setImporting(false);
      const importedTotal = parts.join('; ');
      if (platformErrors.length > 0) {
        setMessage(`Импортировано: ${importedTotal}; всего +${imported}, пропущено ${skippedTotal}`);
        setError(platformErrors.join('\n'));
        return;
      }
      setMessage(
        `Импортировано: ${importedTotal}; всего +${imported}, пропущено ${skippedTotal}. ` +
          'Импортированные треки появились в разделе «Отгружено».'
      );
      void refreshProfile();
    } catch (e: any) {
      setImporting(false);
      setError(e?.message || 'Не удалось сохранить ссылки.');
    } finally {
      setSaving(false);
    }
  };

  if (!profile) return null;

  const toggleRole = (r: ArtistRole) => {
    setRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  };

  const handleSaveProfile = async () => {
    setError('');
    setSaving(true);
    try {
      const isOwnerOrAdmin = profile.role === 'owner' || profile.role === 'admin';
      await updateMyProfile(profile.uid, {
        artistName: artistName.trim() || profile.displayName,
        roles,
        playbackMode,
        downloadTracks,
        skipDuplicateTitles: skipDuplicates,
        ...(isOwnerOrAdmin ? { artistVerified: true, isArtist: true } : {}),
      });
      await renameArtistInTracks(profile.uid, profile.artistName || profile.displayName || '', artistName.trim() || profile.displayName);
      await refreshProfile();
      setMessage('Профиль сохранён.');
    } catch (e: any) {
      setError(e?.message || 'Не удалось сохранить.');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitRequest = async () => {
    setError('');
    setSaving(true);
    try {
      const isOwnerOrAdmin = profile.role === 'owner' || profile.role === 'admin';
      await updateMyProfile(profile.uid, {
        artistName: artistName.trim() || profile.displayName,
        roles,
        playbackMode,
        downloadTracks,
        skipDuplicateTitles: skipDuplicates,
        ...(isOwnerOrAdmin ? { artistVerified: true, isArtist: true } : {}),
      });
      await renameArtistInTracks(profile.uid, profile.artistName || profile.displayName || '', artistName.trim() || profile.displayName);
      await refreshProfile();
      if (profile.artistVerified || isOwnerOrAdmin) {
        setMessage('Профиль сохранён.');
      } else {
        await createArtistRequest({ ...profile, artistName: artistName.trim() || profile.displayName, roles });
        setMessage('Заявка на подтверждение артиста отправлена администратору.');
      }
    } catch (e: any) {
      setError(e?.message || 'Не удалось отправить заявку.');
    } finally {
      setSaving(false);
    }
  };

  const isOwnerOrAdmin = profile.role === 'owner' || profile.role === 'admin';

  return (
    <div className="profile-view">
      <h2>Личный кабинет</h2>

      <div className="profile-card">
        <div className="profile-header">
          <div className="member-avatar">{(profile.artistName || profile.displayName || 'У')[0]}</div>
          <div>
            <div className="member-name">{profile.artistName || profile.displayName}</div>
            <div className="member-email">{profile.email}</div>
            <div className={`member-role role-tag ${profile.role}`}>{profile.role === 'owner' ? 'Владелец' : profile.role === 'admin' ? 'Админ' : 'Участник'}</div>
            <div className="member-artist-status">
              {profile.artistVerified
                ? '✅ Подтверждённый артист'
                : profile.isArtist
                ? '⏳ Заявка на рассмотрении'
                : '❌ Ещё не артист'}
            </div>
          </div>
        </div>

        <div className="profile-form-section">
          <h3>Мои каналы</h3>
          <p className="form-hint">Укажи ссылки на свои каналы — они появятся в шапке профиля. По кнопке &laquo;Импортировать из каналов&raquo; релизы (треки) с этих страниц будут добавлены в кабинет: с YouTube — по ссылке на видео или через список канала, с SoundCloud — по ссылке на профиль (импортируются все треки) или на конкретный трек. В одно поле можно вставить сразу несколько ссылок подряд (через запятую или с новой строки) — они все будут импортированы, а в шапке профиля покажется первая. Можно указать только одну из площадок.</p>

          <div className="form-group">
            <label>YouTube</label>
            <input
              type="url"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/@channel или видео (можно несколько)"
            />
            <div className={`link-status ${linkStatus.youtube === 'invalid' ? 'link-status-invalid' : ''} ${linkStatus.youtube === 'valid' ? 'link-status-valid' : ''}`}>
              {linkStatus.youtube === 'invalid' && '⚠️ Это не похоже на ссылку YouTube'}
              {linkStatus.youtube === 'valid' && '✓ Это ссылка YouTube'}
            </div>
          </div>

          <div className="form-group">
            <label>SoundCloud</label>
            <input
              type="url"
              value={soundcloudUrl}
              onChange={(e) => setSoundcloudUrl(e.target.value)}
              placeholder="https://soundcloud.com/artist — профиль или ссылка на трек (можно несколько)"
            />
            <div className={`link-status ${linkStatus.soundcloud === 'invalid' ? 'link-status-invalid' : ''} ${linkStatus.soundcloud === 'valid' ? 'link-status-valid' : ''}`}>
              {linkStatus.soundcloud === 'invalid' && '⚠️ Это не похоже на ссылку SoundCloud'}
              {linkStatus.soundcloud === 'valid' && '✓ Это ссылка SoundCloud'}
            </div>
          </div>

          <div className="form-group">
            <label className="role-checkbox">
              <input
                type="checkbox"
                checked={skipDuplicates}
                onChange={(e) => setSkipDuplicates(e.target.checked)}
              />
              Не загружать дубликаты названий
            </label>
            <div className="form-hint">
              Если включено — треки, названия которых совпадают с уже существующими на сайте,
              при импорте будут пропущены автоматически. Если выключено — появится окно, где
              можно выбрать, какие совпадения импортировать.
            </div>
          </div>

          <button className="btn-primary" onClick={handleUpdateLinks} disabled={saving || importing}>
            {importing ? 'Импортируем треки…' : 'Импортировать из каналов'}
          </button>
          {message && <div className="success-msg">{message}</div>}
          {error && <div className="error-msg">{error}</div>}
        </div>

        <div className="profile-form-section">
          <h3>Профиль артиста</h3>

          <div className="form-group">
            <label>Сценическое имя</label>
            <input
              type="text"
              value={artistName}
              onChange={(e) => setArtistName(e.target.value)}
              placeholder="Твоё сценическое имя"
            />
          </div>

          <div className="form-group">
            <label>Твои роли в команде</label>
            <div className="role-checkboxes">
              {ROLE_OPTIONS.map((r) => (
                <label className="role-checkbox" key={r.id}>
                  <input type="checkbox" checked={roles.includes(r.id)} onChange={() => toggleRole(r.id)} />
                  {r.label}
                </label>
              ))}
            </div>
            <div className="selected-roles">
              {roles.map((r) => ROLE_LABELS[r]).join(', ')}
            </div>
          </div>

          {isOwnerOrAdmin ? (
            <button className="btn-primary" onClick={handleSaveProfile} disabled={saving}>
              {saving ? 'Сохранение...' : 'Сохранить никнейм и роли'}
            </button>
          ) : (
            <button className="btn-primary" onClick={handleSubmitRequest} disabled={saving}>
              {saving ? 'Отправка...' : profile.artistVerified ? 'Обновить профиль' : 'Подать заявку на подтверждение'}
            </button>
          )}
          {message && <div className="success-msg">{message}</div>}
          {error && <div className="error-msg">{error}</div>}
        </div>

        <div className="profile-card" style={{ marginTop: 16 }}>
          <div className="profile-form-section">
            <h3>Настройки воспроизведения</h3>

            <div className="form-group">
              <label>Предпочтительный источник</label>
              <div className="role-checkboxes">
                <label className="role-checkbox">
                  <input
                    type="radio"
                    name="playbackMode"
                    checked={playbackMode === 'platform'}
                    onChange={() => setPlaybackMode('platform')}
                  />
                  Платформы (SoundCloud / YouTube)
                </label>
                <label className="role-checkbox">
                  <input
                    type="radio"
                    name="playbackMode"
                    checked={playbackMode === 'local'}
                    onChange={() => setPlaybackMode('local')}
                  />
                  Локально (аудио на сайте)
                </label>
              </div>
              <div className="form-hint">
                {playbackMode === 'platform'
                  ? 'Треки будут воспроизводиться через встроенные плееры SoundCloud/YouTube.'
                  : 'Треки будут воспроизводиться через встроенный аудиоплеер на сайте (если загружены в Archive.org).'}
              </div>
            </div>

            <div className="form-group">
              <label className="role-checkbox">
                <input
                  type="checkbox"
                  checked={downloadTracks}
                  onChange={(e) => setDownloadTracks(e.target.checked)}
                />
                Разрешить скачивание треков с сайта
              </label>
              <div className="form-hint">
                Если включено, рядом с треками будет кнопка скачивания.
              </div>
            </div>

            <button className="btn-primary" onClick={handleSaveProfile} disabled={saving}>
              {saving ? 'Сохранение...' : 'Сохранить настройки'}
            </button>
            {message && <div className="success-msg">{message}</div>}
          </div>
        </div>
      </div>

      {dupDialog && (
        <div className="modal-overlay" onClick={() => closeDupDialog([])}>
          <div className="track-form-modal import-dup-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Были обнаружены дубликаты. Хотите импортировать?</h2>
              <button
                className="modal-close"
                title="Не импортировать дубликаты"
                onClick={() => closeDupDialog([])}
              >
                ×
              </button>
            </div>
            <div className="form-section">
              <p className="form-hint">
                Названия этих треков уже есть на сайте. Отметьте те, которые нужно импортировать
                (или нажмите на строку, чтобы снять выбор):
              </p>
              <div className="dup-list">
                {dupDialog.items.map((it, i) => (
                  <label
                    className={`dup-item ${selectedDups.has(i) ? 'dup-item-checked' : ''}`}
                    key={`${it.url}-${i}`}
                    onClick={(e) => {
                      e.preventDefault();
                      toggleDup(i);
                    }}
                  >
                    <input type="checkbox" checked={selectedDups.has(i)} readOnly tabIndex={-1} />
                    <span className="dup-item-info">
                      <span className="dup-item-title">{it.title}</span>
                      <span className="dup-item-author">{it.author}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => closeDupDialog([])}>
                Нет
              </button>
              <button
                className="btn-primary"
                disabled={selectedDups.size === 0}
                onClick={() => closeDupDialog(dupDialog.items.filter((_, i) => selectedDups.has(i)))}
              >
                {selectedDups.size === dupDialog.items.length
                  ? `Импортировать все (${dupDialog.items.length})`
                  : `Импортировать выбранное (${selectedDups.size})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
