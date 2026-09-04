import { useState, useEffect, useRef, useMemo } from 'react';
import Header from './Header';
import KanbanBoard from './KanbanBoard';
import TracksListView from './TracksListView';
import TrackForm from './TrackForm';
import TeamView from './TeamView';
import ProfileView from './ProfileView';
import AdminPanel from './AdminPanel';
import type { Track, UserProfile, ArtistRequest, KanbanColumn } from '../types/track';
import type { TrackFormData } from '../types/track';
import { asArray } from '../types/track';
import {
  subscribeToTracks,
  createTrack,
  updateTrack,
  deleteTrack,
  moveTrack,
} from '../services/trackService';
import {
  subscribeToUsers,
  setUserRole,
} from '../services/userService';
import {
  subscribeToRequests,
  approveArtistRequest,
  rejectArtistRequest,
  clearRequestHistory,
} from '../services/artistRequestService';
import {
  subscribeToNotifications,
  markAllNotificationsRead,
  createNotification,
  deleteNotification,
  clearAllNotifications,
} from '../services/notificationService';
import type { AppNotification } from '../services/notificationService';
import { useAuth } from '../contexts/AuthContext';
import { useNetwork } from '../hooks/useNetwork';
import { saveTrackOffline, addPendingSync } from '../services/offlineStorage';

type View = 'board' | 'tracks' | 'team' | 'profile' | 'admin';

export default function App() {
  const { user, profile, loading } = useAuth();
  const isOnline = useNetwork();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [requests, setRequests] = useState<ArtistRequest[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [view, setView] = useState<View>('board');
  const [showForm, setShowForm] = useState(false);
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);

  const isRoleAllowed = profile?.role === 'owner' || profile?.role === 'admin';
  const isArtistAllowed = !!profile?.artistVerified || isRoleAllowed;
  const canUseBoard = isArtistAllowed || (users.length === 0 && !profile?.artistVerified && !isRoleAllowed);

  const userMap = useMemo(() => {
    const m = new Map<string, UserProfile>();
    for (const u of users) m.set(u.uid, u);
    return m;
  }, [users]);

  const resolveName = (uid: string): string => {
    const u = userMap.get(uid);
    return u?.artistName || u?.displayName || uid;
  };

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToTracks((data) => setTracks(data), (e) => console.error('tracks sub', e));
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToUsers((data) => setUsers(data), (e) => console.error('users sub', e));
    return unsub;
  }, [user]);

  const reqUnsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!user) return;
    reqUnsubRef.current = subscribeToRequests((data) => setRequests(data), (e) => console.error('requests sub', e));
    return () => { reqUnsubRef.current?.(); reqUnsubRef.current = null; };
  }, [user]);

  const notifUnsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!user) return;
    notifUnsubRef.current = subscribeToNotifications((data) => {
      setNotifications(data);
    }, (e) => console.error('notif sub', e));
    return () => { notifUnsubRef.current?.(); notifUnsubRef.current = null; };
  }, [user]);

  const seenNotif = useRef<Set<string>>(new Set());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!profile) return;
    const n = notifications[0];
    if (!n) return;
    if (seenNotif.current.has(n.id)) return;
    seenNotif.current.add(n.id);
    if (!(n.readBy || []).includes(profile.uid)) {
      setToast(n.text);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 6000);
    }
  }, [notifications, profile]);

  if (loading) {
    return <div className="loading-screen">Загрузка...</div>;
  }

  if (!user) {
    return null;
  }

  const members = Array.from(new Set([
    ...users.map((u) => u.artistName || u.displayName),
    ...tracks.flatMap((t) => [
      ...(t.artistUids || []).map(resolveName),
      ...(t.beatmakerUids || []).map(resolveName),
      ...(t.mixByUids || []).map(resolveName),
      ...(t.artists || []),
      ...(t.beatmakers || []),
      ...asArray(t.mixBy),
      t.feat as string,
    ].filter(Boolean)),
  ])).filter(Boolean);

  const projects = Array.from(new Set(tracks.map((t) => t.project).filter((p) => p)));

  const projectData: Record<string, { artists: string[]; artistUids: string[]; beatmakers: string[]; beatmakerUids: string[]; mixBy: string[]; mixByUids: string[] }> = {};
  for (const p of projects) {
    const pTracks = tracks.filter((t) => t.project === p);
    const last = pTracks.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
    if (last) {
      projectData[p] = {
        artists: last.artists || [],
        artistUids: last.artistUids || [],
        beatmakers: last.beatmakers || [],
        beatmakerUids: last.beatmakerUids || [],
        mixBy: asArray(last.mixBy),
        mixByUids: asArray(last.mixByUids),
      };
    }
  }

  const existingNumbers: Record<string, number[]> = {};
  for (const t of tracks) {
    if (t.project && typeof t.trackNumber === 'number') {
      if (!existingNumbers[t.project]) existingNumbers[t.project] = [];
      existingNumbers[t.project].push(t.trackNumber);
    }
  }
  for (const k of Object.keys(existingNumbers)) {
    existingNumbers[k] = Array.from(new Set(existingNumbers[k])).sort((a, b) => a - b);
  }

  const handleOpenTrack = (track: Track) => {
    setEditingTrack(track);
    setShowForm(true);
  };

  const notifyAdminsAndOwner = async (text: string) => {
    const now = new Date().toISOString();
    try {
      await createNotification({
        type: 'task_status_changed',
        text,
        actorUid: profile?.uid || '',
        actorName: profile?.artistName || profile?.displayName,
        createdAt: now,
      });
    } catch {
      // ignore notification errors
    }
  };

  const handleSave = async (data: TrackFormData, id?: string) => {
    const payload = {
      ...data,
      artist: data.artists[0] || '',
      beatmaker: data.beatmakers[0] || '',
      artists: data.artists,
      beatmakers: data.beatmakers,
      artistUids: data.artistUids || [],
      beatmakerUids: data.beatmakerUids || [],
      mixBy: data.mixBy || [],
      mixByUids: data.mixByUids || [],
    };

    const isUpdate = !!id;
    const oldTrack = isUpdate ? tracks.find((t) => t.id === id) : null;

    if (isOnline) {
      if (id) {
        await updateTrack(id, payload as any);
      } else {
        await createTrack(payload as any);
      }

      if (!isUpdate) {
        await notifyAdminsAndOwner(
          `Новый трек создан: «${payload.title}» (артист: ${payload.artists.join(', ') || '—'})`
        );
      } else if (oldTrack && oldTrack.status !== payload.status) {
        const statusLabels: Record<string, string> = {
          draft: 'Черновик', recording: 'Запись', mixing: 'Сведение',
          mastering: 'Мастеринг', ready: 'Готово',
        };
        await notifyAdminsAndOwner(
          `Статус трека «${payload.title}» изменён: ${statusLabels[oldTrack.status] || oldTrack.status} → ${statusLabels[payload.status] || payload.status}`
        );
      }
    } else {
      const offlineTrack: Track = {
        ...payload,
        id: id || crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        coverUrl: undefined,
      } as any;
      await saveTrackOffline(offlineTrack);
      await addPendingSync(id ? 'update' : 'create', offlineTrack.id, offlineTrack);
      setTracks((prev) => (id ? prev.map((t) => (t.id === id ? offlineTrack : t)) : [offlineTrack, ...prev]));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить трек?')) return;
    if (isOnline) {
      await deleteTrack(id);
    } else {
      await addPendingSync('delete', id);
      setTracks((prev) => prev.filter((t) => t.id !== id));
    }
  };

  const handleMove = (id: string, col: KanbanColumn) => moveTrack(id, col);

  const myUid = profile?.uid || '';
  const unreadCount = notifications.filter((n) => !(n.readBy || []).includes(myUid)).length;

  const handleMarkAllRead = async () => {
    if (notifications.length === 0) return;
    await markAllNotificationsRead(notifications, myUid);
    setNotifications((prev) => prev.map((n) => ({ ...n, readBy: Array.from(new Set([...(n.readBy || []), myUid])) })));
  };

  const handleDeleteNotification = async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    await deleteNotification(id);
  };

  const handleClearAllNotifications = async () => {
    if (!confirm('Удалить все уведомления?')) return;
    setNotifications([]);
    await clearAllNotifications();
  };

  const handleOpenAdminRequest = () => setView('admin');

  const handleClearRequests = async () => {
    if (!confirm('Удалить все заявки из истории?')) return;
    setRequests([]);
    await clearRequestHistory();
  };

  return (
    <div className="app">
      <Header
        view={view}
        onViewChange={setView}
        onCreateTrack={() => {
          if (!canUseBoard) return;
          setEditingTrack(null);
          setShowForm(true);
        }}
        notifications={notifications}
        unreadCount={unreadCount}
        onMarkAllRead={handleMarkAllRead}
        onDeleteNotification={handleDeleteNotification}
        onClearAll={handleClearAllNotifications}
        onOpenAdminRequest={handleOpenAdminRequest}
      />

      <main className="app-main">
        {!canUseBoard && (
          <div className="gate-block">
            <h2>Доска недоступна</h2>
            <p>Доступ к доске открыт после подтверждения профиля артиста администратором.</p>
            <p>Перейдите в «Кабинет» и подайте заявку на подтверждение артиста.</p>
          </div>
        )}

        {canUseBoard && view === 'board' && (
          <KanbanBoard tracks={tracks} onOpenTrack={handleOpenTrack} onMove={handleMove} userMap={userMap} />
        )}

        {canUseBoard && view === 'tracks' && (
          <TracksListView
            tracks={tracks}
            users={users}
            userMap={userMap}
            onOpen={handleOpenTrack}
            onDelete={handleDelete}
          />
        )}

        {view === 'team' && (
          <TeamView
            users={users}
            currentUid={profile?.uid || ''}
            canManage={isRoleAllowed}
            onSetRole={setUserRole}
            tracks={tracks}
          />
        )}

        {view === 'profile' && <ProfileView />}

        {view === 'admin' && isRoleAllowed && (
          <AdminPanel
            users={users}
            requests={requests}
            tracks={tracks}
            onSetRole={setUserRole}
            onDeleteTrack={handleDelete}
            onApprove={approveArtistRequest}
            onReject={rejectArtistRequest}
            onClearRequests={handleClearRequests}
            currentUserRole={profile?.role}
          />
        )}
      </main>

      {toast && <div className="toast">{toast}</div>}

      {showForm && canUseBoard && (
        <TrackForm
          initialTrack={editingTrack || undefined}
          members={members}
          projects={projects}
          projectData={projectData}
          existingNumbers={existingNumbers}
          users={users.map((u) => ({ uid: u.uid, displayName: u.artistName || u.displayName }))}
          userMap={userMap}
          onClose={() => {
            setShowForm(false);
            setEditingTrack(null);
          }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
