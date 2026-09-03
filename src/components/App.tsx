import { useState, useEffect } from 'react';
import Header from './Header';
import KanbanBoard from './KanbanBoard';
import TracksListView from './TracksListView';
import TrackForm from './TrackForm';
import TeamView from './TeamView';
import type { Track, UserProfile } from '../types/track';
import type { TrackFormData } from '../types/track';
import {
  subscribeToTracks,
  createTrack,
  updateTrack,
  deleteTrack,
} from '../services/trackService';
import { subscribeToUsers, setUserRole } from '../services/userService';
import { useAuth } from '../contexts/AuthContext';
import { useNetwork } from '../hooks/useNetwork';
import { saveTrackOffline, addPendingSync } from '../services/offlineStorage';

type View = 'board' | 'tracks' | 'team';

export default function App() {
  const { user, profile, loading } = useAuth();
  const isOnline = useNetwork();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [view, setView] = useState<View>('board');
  const [showForm, setShowForm] = useState(false);
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToTracks((data) => setTracks(data));
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToUsers((data) => setUsers(data));
    return unsub;
  }, [user]);

  if (loading) {
    return <div className="loading-screen">Загрузка...</div>;
  }

  if (!user) {
    return null;
  }

  const artists = Array.from(new Set(tracks.map((t) => t.artist).filter((a) => a && a !== '—')));
  const beatmakers = Array.from(new Set(tracks.map((t) => t.beatmaker).filter((b) => b && b !== '—')));
  const projects = Array.from(new Set(tracks.map((t) => t.project).filter((p) => p)));

  const handleOpenTrack = (track: Track) => {
    setEditingTrack(track);
    setShowForm(true);
  };

  const handleSave = async (data: TrackFormData, id?: string) => {
    if (isOnline) {
      if (id) {
        await updateTrack(id, data as Partial<Track>);
      } else {
        await createTrack(data);
      }
    } else {
      const offlineTrack: Track = {
        ...data,
        id: id || crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
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

  const canManageUsers = profile?.role === 'owner' || profile?.role === 'admin';

  return (
    <div className="app">
      <Header
        view={view}
        onViewChange={setView}
        onCreateTrack={() => {
          setEditingTrack(null);
          setShowForm(true);
        }}
      />

      <main className="app-main">
        {view === 'board' && (
          <KanbanBoard
            tracks={tracks}
            onOpenTrack={handleOpenTrack}
          />
        )}

        {view === 'tracks' && (
          <TracksListView tracks={tracks} onOpen={handleOpenTrack} onDelete={handleDelete} />
        )}

        {view === 'team' && (
          <TeamView
            users={users}
            currentUid={profile?.uid || ''}
            canManage={canManageUsers}
            onSetRole={setUserRole}
            tracks={tracks}
          />
        )}
      </main>

      {showForm && (
        <TrackForm
          initialTrack={editingTrack || undefined}
          artists={artists}
          beatmakers={beatmakers}
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
