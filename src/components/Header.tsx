import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNetwork } from '../hooks/useNetwork';

type View = 'board' | 'tracks' | 'team' | 'profile' | 'admin';

interface HeaderProps {
  view: View;
  onViewChange: (view: View) => void;
  onCreateTrack: () => void;
}

const NAV: { id: View; label: string }[] = [
  { id: 'board', label: 'Доска' },
  { id: 'tracks', label: 'Треки' },
  { id: 'team', label: 'Команда' },
];

export default function Header({ view, onViewChange, onCreateTrack }: HeaderProps) {
  const { profile, signOut } = useAuth();
  const isOnline = useNetwork();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const canAdmin = profile?.role === 'owner' || profile?.role === 'admin';

  const go = (v: View) => {
    onViewChange(v);
    setMenuOpen(false);
  };

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <header className="app-header">
      <div className="header-left">
        <div className="logo">
          <span className="logo-text">VTG</span>
          <span className="logo-sub">Dashboard</span>
        </div>
        <nav className="header-nav">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`nav-btn ${view === n.id ? 'active' : ''}`}
              onClick={() => go(n.id)}
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

        <div className="profile-menu" ref={menuRef}>
          <button className="user-info" onClick={() => setMenuOpen((o) => !o)}>
            <span className="user-avatar">{profile?.displayName?.[0] || 'У'}</span>
            <span className="user-name">{profile?.displayName || 'Участник'}</span>
            <span className="user-chevron">{menuOpen ? '▲' : '▼'}</span>
          </button>

          {menuOpen && (
            <div className="profile-dropdown">
              <button className="dd-item" onClick={() => go('profile')}>
                Личный кабинет
              </button>
              {canAdmin && (
                <button className="dd-item" onClick={() => go('admin')}>
                  Админ панель
                </button>
              )}
              <button className="dd-item dd-logout" onClick={signOut}>
                Выйти
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
