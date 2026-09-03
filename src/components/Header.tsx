import { useAuth } from '../contexts/AuthContext';
import { useNetwork } from '../hooks/useNetwork';

interface HeaderProps {
  view: 'board' | 'tracks' | 'team';
  onViewChange: (view: 'board' | 'tracks' | 'team') => void;
  onCreateTrack: () => void;
}

export default function Header({ view, onViewChange, onCreateTrack }: HeaderProps) {
  const { profile, signOut } = useAuth();
  const isOnline = useNetwork();

  return (
    <header className="app-header">
      <div className="header-left">
        <div className="logo">
          <span className="logo-text">VTG</span>
          <span className="logo-sub">Dashboard</span>
        </div>
        <nav className="header-nav">
          <button
            className={`nav-btn ${view === 'board' ? 'active' : ''}`}
            onClick={() => onViewChange('board')}
          >
            Доска
          </button>
          <button
            className={`nav-btn ${view === 'tracks' ? 'active' : ''}`}
            onClick={() => onViewChange('tracks')}
          >
            Треки
          </button>
          <button
            className={`nav-btn ${view === 'team' ? 'active' : ''}`}
            onClick={() => onViewChange('team')}
          >
            Команда
          </button>
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
          <span className={`user-role role-${profile?.role}`}>{profile?.role}</span>
        </div>
        <button className="btn-logout" onClick={signOut}>
          Выйти
        </button>
      </div>
    </header>
  );
}
