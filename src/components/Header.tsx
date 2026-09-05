import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNetwork } from '../hooks/useNetwork';
import type { AppNotification } from '../services/notificationService';

type View = 'board' | 'tracks' | 'beats' | 'team' | 'profile' | 'admin' | 'projects';

interface HeaderProps {
  view: View;
  onViewChange: (view: View) => void;
  onCreateTrack: () => void;
  notifications: AppNotification[];
  unreadCount: number;
  onMarkAllRead: () => void;
  onDeleteNotification: (id: string) => void;
  onClearAll: () => void;
  onOpenAdminRequest: () => void;
}

const NAV: { id: View; label: string }[] = [
  { id: 'board', label: 'Доска' },
  { id: 'tracks', label: 'Треки' },
  { id: 'beats', label: 'Биты' },
  { id: 'projects', label: 'Проекты' },
  { id: 'team', label: 'Команда' },
];

export default function Header({
  view,
  onViewChange,
  onCreateTrack,
  notifications,
  unreadCount,
  onMarkAllRead,
  onDeleteNotification,
  onClearAll,
  onOpenAdminRequest,
}: HeaderProps) {
  const { profile, signOut } = useAuth();
  const isOnline = useNetwork();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const canAdmin = profile?.role === 'owner' || profile?.role === 'admin';

  const go = (v: View) => {
    onViewChange(v);
    setMenuOpen(false);
    setNotifOpen(false);
  };

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const openAdminAndClose = () => {
    onOpenAdminRequest();
    setNotifOpen(false);
  };

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

        <div className="notif-menu" ref={notifRef}>
          <button className="notif-bell" onClick={() => setNotifOpen((o) => !o)}>
            🔔
            {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
          </button>
          {notifOpen && (
            <div className="notif-dropdown">
              <div className="notif-header">
                <span>Уведомления</span>
                <div className="notif-header-actions">
                  {unreadCount > 0 && (
                    <button className="notif-markall" onClick={onMarkAllRead}>
                      Прочитать всё
                    </button>
                  )}
                  {notifications.length > 0 && (
                    <button className="notif-clearall" onClick={onClearAll}>
                      Удалить всё
                    </button>
                  )}
                </div>
              </div>
              {notifications.length === 0 && (
                <div className="notif-empty">Уведомлений нет</div>
              )}
              {notifications.map((n) => {
                const unread = !(n.readBy || []).includes(profile?.uid || '');
                return (
                  <div key={n.id} className={`notif-item ${unread ? 'unread' : ''}`}>
                    <button className="notif-item-main" onClick={openAdminAndClose}>
                      <span className="notif-dot" />
                      <span className="notif-text">{n.text}</span>
                      <span className="notif-time">
                        {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </button>
                    <button
                      className="notif-delete"
                      title="Удалить"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteNotification(n.id);
                      }}
                    >
                      🗑
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="profile-menu" ref={menuRef}>
          <button className="user-info" onClick={() => setMenuOpen((o) => !o)}>
            <span className="user-avatar">{(profile?.artistName || profile?.displayName || 'У')[0]}</span>
            <span className="user-name">{profile?.artistName || profile?.displayName || 'Участник'}</span>
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
