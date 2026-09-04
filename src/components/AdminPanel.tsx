import { useState } from 'react';
import type { UserProfile, Track, ArtistRequest, UserRole } from '../types/track';
import { denyArtistRole } from '../services/artistRequestService';
import { getRoleOptionsFor, canChangeRole, canDenyArtist } from '../utils/roles';

interface AdminPanelProps {
  users: UserProfile[];
  requests: ArtistRequest[];
  tracks: Track[];
  onSetRole: (uid: string, role: UserRole) => Promise<void>;
  onDeleteTrack: (id: string) => void;
  onApprove: (id: string, req: ArtistRequest) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  onClearRequests: () => void;
  currentUserRole?: UserRole;
  currentUid?: string;
}

const ROLE_LABELS: Record<UserRole, string> = {
  member: 'Участник',
  admin: 'Админ',
  owner: 'Владелец',
};

export default function AdminPanel({ users, requests, tracks, onSetRole, onDeleteTrack, onApprove, onReject, onClearRequests, currentUserRole, currentUid }: AdminPanelProps) {
  const [tab, setTab] = useState<'requests' | 'users' | 'tracks' | 'stats'>('requests');

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
                    {canChangeRole(currentUserRole, u, currentUid) ? (
                      <select
                        className="role-select"
                        value={u.role}
                        onChange={(e) => onSetRole(u.uid, e.target.value as UserRole).catch(console.error)}
                      >
                        {getRoleOptionsFor(currentUserRole, u, currentUid).map((o) => (
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
