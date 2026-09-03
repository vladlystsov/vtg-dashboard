import type { UserProfile, UserRole, Track } from '../types/track';

interface TeamViewProps {
  users: UserProfile[];
  currentUid: string;
  canManage: boolean;
  onSetRole: (uid: string, role: UserRole) => Promise<void>;
  tracks: Track[];
}

const ROLE_LABELS: Record<UserRole, string> = {
  member: 'Участник',
  admin: 'Админ',
  owner: 'Владелец',
};

export default function TeamView({ users, currentUid, canManage, onSetRole, tracks }: TeamViewProps) {
  return (
    <div className="team-view">
      <h2>Команда VTG</h2>
      <div className="team-members">
        {users.map((u) => {
          const createdByThem = tracks.filter((t) => t.createdBy === u.uid).length;
          const assignedToThem = tracks.filter((t) =>
            t.checklist.some((c) => c.assignee === u.displayName)
          ).length;
          return (
            <div className="team-member" key={u.uid}>
              <div className="member-avatar">{u.displayName?.[0] || 'У'}</div>
              <div className="member-info">
                <div className="member-name">
                  {u.displayName}
                  {u.uid === currentUid && <span className="member-you"> (вы)</span>}
                </div>
                <div className={`member-role role-tag ${u.role}`}>{ROLE_LABELS[u.role] || u.role}</div>
                <div className="member-stats">
                  Создано: {createdByThem} · Назначен: {assignedToThem}
                </div>
                {canManage && u.uid !== currentUid && (
                  <div className="role-controls">
                    <select
                      className="role-select"
                      defaultValue={u.role}
                      onChange={(e) => onSetRole(u.uid, e.target.value as UserRole).catch(console.error)}
                    >
                      <option value="member">Участник</option>
                      <option value="admin">Админ</option>
                      <option value="owner">Владелец</option>
                    </select>
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
