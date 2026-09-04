import type { UserProfile, UserRole, Track } from '../types/track';
import { getRoleOptionsFor, canChangeRole, isSoleOwnerDemoting } from '../utils/roles';

interface TeamViewProps {
  users: UserProfile[];
  currentUid: string;
  canManage: boolean;
  currentUserRole?: UserRole;
  ownerCount?: number;
  onSetRole: (uid: string, role: UserRole) => Promise<void>;
  onDeleteUser: (uid: string, name: string) => Promise<void>;
  tracks: Track[];
}

const ROLE_LABELS: Record<UserRole, string> = {
  member: 'Участник',
  admin: 'Админ',
  owner: 'Владелец',
};

export default function TeamView({ users, currentUid, canManage, currentUserRole, ownerCount = 1, onSetRole, onDeleteUser, tracks }: TeamViewProps) {
  const canDeleteUser = (u: UserProfile): boolean => {
    if (u.role === 'owner') return false;
    if (currentUserRole === 'owner') return true;
    if (currentUserRole === 'admin') return u.role === 'member';
    return false;
  };
  return (
    <div className="team-view">
      <h2>Команда VTG</h2>
      <div className="team-members">
        {users.map((u) => {
          const createdByThem = tracks.filter((t) => t.createdBy === u.uid).length;
          const assignedToThem = tracks.filter((t) =>
            (t.checklist || []).some((c) => c.assignee === u.displayName)
          ).length;
          const isSelf = u.uid === currentUid;
          const canEdit = canManage && canChangeRole(currentUserRole, u, currentUid, ownerCount);
          const soleOwnerDemote = isSoleOwnerDemoting(currentUserRole, u, currentUid, ownerCount);
          const isDeletable = canManage && canDeleteUser(u);
          return (
            <div className="team-member" key={u.uid}>
              <div className="member-avatar">{(u.artistName || u.displayName || 'У')[0]}</div>
              <div className="member-info">
                <div className="member-name">
                  {u.artistName || u.displayName}
                  {isSelf && <span className="member-you"> (вы)</span>}
                </div>
                <div className={`member-role role-tag ${u.role}`}>{ROLE_LABELS[u.role] || u.role}</div>
                <div className="member-stats">
                  Создано: {createdByThem} · Назначен: {assignedToThem}
                </div>
                {canEdit && (
                  <div className="role-controls">
                    {soleOwnerDemote ? (
                      <select className="role-select" disabled title="Назначьте сначала владельцем другого" value={u.role}>
                        <option value="owner">Владелец</option>
                      </select>
                    ) : (
                      <select
                        className="role-select"
                        value={u.role}
                        onChange={(e) => onSetRole(u.uid, e.target.value as UserRole).catch(console.error)}
                      >
                        {getRoleOptionsFor(currentUserRole, u, currentUid, ownerCount).map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    )}
                    {isDeletable && (
                      <button
                        className="btn-small-ghost btn-danger"
                        title="Удалить из команды"
                        onClick={() => onDeleteUser(u.uid, u.artistName || u.displayName || u.email).catch(console.error)}
                      >
                        Удалить из команды
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {users.length === 0 && <div className="empty-state">Пока нет участников</div>}
    </div>
  );
}
