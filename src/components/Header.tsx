import { useAuth } from '../contexts/AuthContext';
import { useNetwork } from '../hooks/useNetwork';

type View = 'board' | 'tracks' | 'team' | 'profile' | 'admin';

interface HeaderProps {
  view: View;
  onViewChange: (view: View) => void;
  onCreateTrack: () => void;
}

const NAV: { id: View; label: string; adminOnly?: boolean }[] = [
  { id: 'board', label: 'Доска' },
  { id: 'tracks', label: 'Треки' },
  { id: 'team', label: 'Команда' },
  { id: 'profile', label: 'Кабинет' },
  { id: 'admin', label: 'Админ', adminOnly: true },
];

export default function Header({ view, onViewChange, onCreateTrack }: HeaderProps) {
  const { profile, signOut } = useAuth();
  const isOnline = useNetwork();
  const canAdmin = profile?.role === 'owner' || profile?.role === 'admin';

  return (
    <header className="app-header">
      <div className="header-left">
        <div className="logo">
          <span className="logo-text">VTG</span>
          <span className="logo-sub">Dashboard</span>
        </div>
        <nav className="header-nav">
          {NAV.filter((n) => !n.adminOnly || canAdmin).map((n) => (
            <button
              key={n.id}
              className={`nav-btn ${view === n.id ? 'active' : ''}`}
              onClick={() => onViewChange(n.id)}
            >
              {n.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="header-right">
        <div className={`network-indicator ${isOnline ? 'online' : 'offline'}`}>
          <span className="network-dot" />
          {isOnline ? 'Онлайн' : 'Офлайн'}
        </div>
        <button className="btn-create" onClick={onCreateTrack}>
          + Создать трек
        </button>
        <div className="user-info">
          <span className="user-name">{profile?.displayName || 'Участник'}</span>
          {profile?.artistVerified ? (
            <span className="user-artist-badge">Art</span>
          ) : profile?.isArtist === false || profile?.role === 'member' ? (
            <span className="user-artist-badge pending">не артист</span>
          ) : null}
          <span className={`user-role role-${profile?.role}`}>{profile?.role}</span>
        </div>
        <button className="btn-logout" onClick={signOut}>
          Выйти
        </button>
      </div>
    </header>
  );
}
