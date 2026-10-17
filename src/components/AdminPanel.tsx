import { useEffect, useState } from 'react';
import type { UserProfile, Track, ArtistRequest, UserRole, Project } from '../types/track';
import type { Beat } from '../types/beat';
import {
  denyArtistRole,
} from '../services/artistRequestService';
import { getRoleOptionsFor, canChangeRole, canDenyArtist, isSoleOwnerDemoting } from '../utils/roles';
import StorageExplorer from './StorageExplorer';
import {
  subscribeToAppNews,
  createAppNews,
  deleteAppNews,
} from '../services/appNewsService';
import type { AppNewsItem } from '../services/appNewsService';

interface AdminPanelProps {
  users: UserProfile[];
  requests: ArtistRequest[];
  tracks: Track[];
  beats?: Beat[];
  projects?: Project[];
  onSetRole: (uid: string, role: UserRole) => Promise<void>;
  onDeleteTrack: (id: string) => void;
  onApprove: (id: string, req: ArtistRequest) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  onClearRequests: () => void;
  currentUserRole?: UserRole;
  currentUid?: string;
  ownerCount?: number;
  // Очистка при удалении файлов из хранилища (вкладка «Хранилище»):
  // удаление карточки проекта и точечная очистка полей трека/бита
  onStorageDeleteProject?: (id: string) => Promise<void>;
  onUpdateTrackFields?: (id: string, patch: Record<string, unknown>) => Promise<void>;
  onUpdateBeatFields?: (id: string, patch: Record<string, unknown>) => Promise<void>;
}

const ROLE_LABELS: Record<UserRole, string> = {
  member: 'Участник',
  admin: 'Админ',
  owner: 'Владелец',
};

export default function AdminPanel({ users, requests, tracks, beats, projects, onSetRole, onDeleteTrack, onApprove, onReject, onClearRequests, currentUserRole, currentUid, ownerCount = 1, onStorageDeleteProject, onUpdateTrackFields, onUpdateBeatFields }: AdminPanelProps) {
  const [tab, setTab] = useState<'requests' | 'users' | 'tracks' | 'news' | 'storage' | 'stats'>('requests');

  const pendingRequests = requests.filter((r) => r.status === 'pending');

  const handleClearHistory = () => {
    if (!confirm('Удалить все заявки из истории? Это действие необратимо.')) return;
    onClearRequests();
  };

  return (
    <div className="admin-panel">
      <h2>Панель администратора</h2>

      <div className="admin-tabs">
        <button className={`nav-btn ${tab === 'requests' ? 'active' : ''}`} onClick={() => setTab('requests')}>
          Заявки ({pendingRequests.length})
        </button>
        <button className={`nav-btn ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>
          Пользователи ({users.length})
        </button>
        <button className={`nav-btn ${tab === 'tracks' ? 'active' : ''}`} onClick={() => setTab('tracks')}>
          Треки ({tracks.length})
        </button>
        <button className={`nav-btn ${tab === 'news' ? 'active' : ''}`} onClick={() => setTab('news')}>
          Новости
        </button>
        <button className={`nav-btn ${tab === 'storage' ? 'active' : ''}`} onClick={() => setTab('storage')}>
          Хранилище
        </button>
        <button className={`nav-btn ${tab === 'stats' ? 'active' : ''}`} onClick={() => setTab('stats')}>
          Состояние
        </button>
      </div>

      {tab === 'requests' && (
        <div className="admin-section">
          <div className="admin-section-header">
            {requests.length > 0 && (
              <button className="btn-reject btn-clear-history" onClick={handleClearHistory}>
                Очистить историю заявок
              </button>
            )}
          </div>
          {pendingRequests.length === 0 && requests.length === 0 && <div className="empty-state">Нет заявок</div>}
          {requests.map((req) => (
            <div className={`admin-request ${req.status}`} key={req.id}>
              <div className="admin-request-info">
                <div className="admin-request-name">{req.displayName}</div>
                <div className="admin-request-artist">Сценическое имя: {req.artistName}</div>
                <div className="admin-request-roles">{req.roles.join(', ')}</div>
                <div className="admin-request-time">{new Date(req.createdAt).toLocaleString()}</div>
              </div>
              {req.status === 'pending' && (
                <div className="admin-request-actions">
                  <button className="btn-approve" onClick={() => onApprove(req.id, req)}>Одобрить</button>
                  <button className="btn-reject" onClick={() => onReject(req.id)}>Отклонить</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'users' && (
        <div className="admin-section">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Имя</th>
                <th>Email</th>
                <th>Артист</th>
                <th>Роль</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.uid}>
                  <td>{u.artistName || u.displayName}</td>
                  <td>{u.email}</td>
                  <td>{u.artistVerified ? '✅' : u.isArtist ? '⏳' : '—'}</td>
                  <td className={`role-tag ${u.role}`}>{ROLE_LABELS[u.role] || u.role}</td>
                  <td>
                    {isSoleOwnerDemoting(currentUserRole, u, currentUid, ownerCount) ? (
                      <select className="role-select" disabled title="Назначьте сначала владельцем другого" value={u.role}>
                        <option value="owner">Владелец</option>
                      </select>
                    ) : canChangeRole(currentUserRole, u, currentUid, ownerCount) ? (
                      <select
                        className="role-select"
                        value={u.role}
                        onChange={(e) => onSetRole(u.uid, e.target.value as UserRole).catch(console.error)}
                      >
                        {getRoleOptionsFor(currentUserRole, u, currentUid, ownerCount).map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="role-locked" title="Роль другого владельца нельзя изменить">—</span>
                    )}
                    {u.artistVerified && (
                      <button
                        className="btn-small-ghost"
                        disabled={!canDenyArtist(currentUserRole, u, currentUid)}
                        title={canDenyArtist(currentUserRole, u, currentUid) ? 'Снять подтверждение артиста' : 'Нельзя снять подтверждённого артиста'}
                        onClick={() => {
                          if (confirm(`Снять статус подтверждённого артиста с «${u.artistName || u.displayName}»?`)) {
                            denyArtistRole(u.uid).catch(console.error);
                          }
                        }}
                      >
                        Снять артиста
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'tracks' && (
        <div className="admin-section">
          {tracks.map((t) => (
            <div className="admin-track" key={t.id}>
              <span className="admin-track-title">{t.title}</span>
              <span className="admin-track-sub">{t.project}</span>
              <button className="btn-reject" onClick={() => onDeleteTrack(t.id)}>Удалить</button>
            </div>
          ))}
          {tracks.length === 0 && <div className="empty-state">Нет треков</div>}
        </div>
      )}

      {tab === 'news' && (
        <div className="admin-section">
          <NewsTab currentUid={currentUid} />
        </div>
      )}

      {tab === 'storage' && (
        <div className="admin-section">
          <StorageExplorer
            tracks={tracks}
            beats={beats || []}
            projects={projects || []}
            onStorageDeleteProject={onStorageDeleteProject}
            onUpdateTrackFields={onUpdateTrackFields}
            onUpdateBeatFields={onUpdateBeatFields}
          />
        </div>
      )}

      {tab === 'stats' && (
        <div className="admin-section">
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-num">{users.length}</div>
              <div className="stat-label">Пользователей</div>
            </div>
            <div className="stat-card">
              <div className="stat-num">{users.filter((u) => u.artistVerified).length}</div>
              <div className="stat-label">Подтверждённых артистов</div>
            </div>
            <div className="stat-card">
              <div className="stat-num">{tracks.length}</div>
              <div className="stat-label">Треков</div>
            </div>
            <div className="stat-card">
              <div className="stat-num">{pendingRequests.length}</div>
              <div className="stat-label">Ожидающих заявок</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Вкладка «Новости» (Фаза 5): публикация записи в `appNews` —
 * она появится как плашка у всех авторизованных (см. NewsBanner).
 */
function NewsTab({ currentUid }: { currentUid?: string }) {
  const [items, setItems] = useState<AppNewsItem[]>([]);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [version, setVersion] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeToAppNews(setItems, (e) => console.error('appNews sub', e)), []);

  const publish = async () => {
    if (!title.trim() || !text.trim() || busy) return;
    setBusy(true);
    try {
      await createAppNews({
        title: title.trim(),
        text: text.trim(),
        version: version.trim() || undefined,
        authorUid: currentUid,
      });
      setTitle('');
      setText('');
      setVersion('');
    } catch (e) {
      console.error('appNews create', e);
      alert('Не удалось опубликовать новость (нужна роль админа/владельца).');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="news-form">
        <input
          className="news-input"
          placeholder="Заголовок (напр. «Что нового в 2.5.0»)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
        />
        <textarea
          className="news-input news-textarea"
          placeholder="Текст новости: что изменилось, что нужно сделать пользователям"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          maxLength={4000}
        />
        <div className="news-form-row">
          <input
            className="news-input news-version"
            placeholder="Версия, напр. 2.4.0"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            maxLength={20}
          />
          <button
            type="button"
            className="btn-create"
            disabled={busy || !title.trim() || !text.trim()}
            onClick={publish}
          >
            {busy ? 'Публикация…' : 'Опубликовать'}
          </button>
        </div>
      </div>

      {items.length === 0 && <div className="empty-state">Новостей пока нет</div>}
      {items.map((n) => (
        <div className="news-admin-item" key={n.id}>
          <div className="news-admin-info">
            <div className="news-admin-title">
              {n.version && <span className="news-banner-version">v{n.version}</span>} {n.title}
            </div>
            <div className="news-admin-text">{n.text}</div>
            <div className="news-admin-date">
              {new Date(n.createdAt).toLocaleString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          </div>
          <button
            type="button"
            className="btn-reject"
            onClick={() => {
              if (confirm(`Удалить новость «${n.title}»?`)) deleteAppNews(n.id).catch(console.error);
            }}
          >
            Удалить
          </button>
        </div>
      ))}
    </>
  );
}
