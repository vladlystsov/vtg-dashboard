import { useState, useEffect } from 'react';
import Header from './Header';
import KanbanBoard from './KanbanBoard';
import TracksListView from './TracksListView';
import TrackForm from './TrackForm';
import TeamView from './TeamView';
import ProfileView from './ProfileView';
import AdminPanel from './AdminPanel';
import type { Track, UserProfile, ArtistRequest, KanbanColumn } from '../types/track';
import type { TrackFormData } from '../types/track';
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
} from '../services/artistRequestService';
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
  const [view, setView] = useState<View>('board');
  const [showForm, setShowForm] = useState(false);
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);

  const isRoleAllowed = profile?.role === 'owner' || profile?.role === 'admin';
  const isArtistAllowed = !!profile?.artistVerified || isRoleAllowed;
  // if there are no users or the current user is the owner, allow anyway
  const canUseBoard = isArtistAllowed || (users.length === 0 && !profile?.artistVerified && !isRoleAllowed);

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

  useEffect(() => {
    if (!user) return;
    if (isRoleAllowed) {
      const unsub = subscribeToRequests((data) => setRequests(data), (e) => console.error('requests sub', e));
      return unsub;
    }
  }, [user, isRoleAllowed]);

  if (loading) {
    return <div className="loading-screen">Загрузка...</div>;
  }

  if (!user) {
    return null;
  }

  const members = Array.from(new Set([
    ...users.map((u) => u.artistName || u.displayName),
    ...tracks.flatMap((t) => [...t.artists, ...t.beatmakers, t.mixBy, t.feat].filter(Boolean)),
  ])).filter(Boolean);

  const projects = Array.from(new Set(tracks.map((t) => t.project).filter((p) => p)));

  const handleOpenTrack = (track: Track) => {
    setEditingTrack(track);
    setShowForm(true);
  };

  const handleSave = async (data: TrackFormData, id?: string) => {
    const payload = {
      ...data,
      artist: data.artists[0] || '',
      beatmaker: data.beatmakers[0] || '',
      artists: data.artists,
      beatmakers: data.beatmakers,
    };
    if (isOnline) {
      if (id) {
        await updateTrack(id, payload as any);
      } else {
        await createTrack(payload as any);
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
          <KanbanBoard tracks={tracks} onOpenTrack={handleOpenTrack} onMove={handleMove} />
        )}

        {canUseBoard && view === 'tracks' && (
          <TracksListView tracks={tracks} onOpen={handleOpenTrack} onDelete={handleDelete} />
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
          />
        )}
      </main>

      {showForm && canUseBoard && (
        <TrackForm
          initialTrack={editingTrack || undefined}
          members={members}
          projects={projects}
          users={users.map((u) => ({ uid: u.uid, displayName: u.displayName }))}
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
