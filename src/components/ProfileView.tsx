import { useState } from 'react';
import type { ArtistRole, PlaybackMode } from '../types/track';
import { useAuth } from '../contexts/AuthContext';
import { createArtistRequest } from '../services/artistRequestService';
import { updateMyProfile } from '../services/userService';
import { renameArtistInTracks } from '../services/trackService';

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

export default function ProfileView() {
  const { profile, refreshProfile } = useAuth();
  const [artistName, setArtistName] = useState(profile?.artistName || '');
  const [roles, setRoles] = useState<ArtistRole[]>(profile?.roles || ['artist']);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>(profile?.playbackMode || 'platform');
  const [downloadTracks, setDownloadTracks] = useState(!!profile?.downloadTracks);
  const [youtubeUrl, setYoutubeUrl] = useState(profile?.youtubeUrl || '');
  const [soundcloudUrl, setSoundcloudUrl] = useState(profile?.soundcloudUrl || '');
  const [linkStatus, setLinkStatus] = useState<Record<string, 'valid' | 'invalid' | 'empty'>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const validateLink = (url: string, platform: 'youtube' | 'soundcloud'): 'valid' | 'invalid' | 'empty' => {
    const t = url.trim();
    if (!t) {
      return 'empty';
    }
    try {
      const parsed = new URL(t);
      if (platform === 'youtube') {
        return parsed.hostname === 'www.youtube.com' || parsed.hostname === 'youtube.com' || parsed.hostname === 'youtu.be' ? 'valid' : 'invalid';
      }
      return parsed.hostname === 'soundcloud.com' || parsed.hostname === 'www.soundcloud.com' ? 'valid' : 'invalid';
    } catch {
      return 'invalid';
    }
  };

  const normalizeChannelUrl = (url: string, platform: 'youtube' | 'soundcloud'): string => {
    const t = url.trim();
    if (!t) return t;
    if (platform === 'soundcloud' && t.startsWith('soundcloud.com/')) {
      return 'https://' + t;
    }
    if (platform === 'soundcloud' && t.startsWith('www.soundcloud.com/')) {
      return 'https://' + t;
    }
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
    if (statuses.youtube === 'invalid' || statuses.soundcloud === 'invalid') {
      setError('Проверьте ссылки: YouTube должен вести на youtube.com/youtu.be, SoundCloud — на soundcloud.com.');
      return;
    }
    setSaving(true);
    try {
      await updateMyProfile(profile!.uid, {
        youtubeUrl: normalizeChannelUrl(youtubeUrl, 'youtube') || undefined,
        soundcloudUrl: normalizeChannelUrl(soundcloudUrl, 'soundcloud') || undefined,
      });
      await refreshProfile();
      setMessage('Ссылки сохранены.');
    } catch (e: any) {
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
          <p className="form-hint">Укажи ссылки на свои каналы — они появятся в шапке профиля. По кнопке &laquo;Импортировать&raquo; релизы с этих страниц будут добавлены в кабинет из импортированных треков.</p>

          <div className="form-group">
            <label>YouTube</label>
            <input
              type="url"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/@channel"
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
              placeholder="https://soundcloud.com/artist"
            />
            <div className={`link-status ${linkStatus.soundcloud === 'invalid' ? 'link-status-invalid' : ''} ${linkStatus.soundcloud === 'valid' ? 'link-status-valid' : ''}`}>
              {linkStatus.soundcloud === 'invalid' && '⚠️ Это не похоже на ссылку SoundCloud'}
              {linkStatus.soundcloud === 'valid' && '✓ Это ссылка SoundCloud'}
            </div>
          </div>

          <button className="btn-primary" onClick={handleUpdateLinks} disabled={saving}>
            Импортировать из каналов
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
    </div>
  );
}
