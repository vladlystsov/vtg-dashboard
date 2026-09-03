import type { Track } from '../types/track';
import { STATUS_LABELS } from '../types/track';
import { useAuth } from '../contexts/AuthContext';

interface TracksListViewProps {
  tracks: Track[];
  onOpen: (track: Track) => void;
  onDelete: (id: string) => void;
}

export default function TracksListView({ tracks, onOpen, onDelete }: TracksListViewProps) {
  const sorted = tracks
    .slice()
    .sort((a, b) => (a.trackNumber || 0) - (b.trackNumber || 0) || a.title.localeCompare(b.title));

  return (
    <div className="deck-grid">
      {sorted.map((track) => (
        <DeckCard key={track.id} track={track} onOpen={onOpen} onDelete={onDelete} />
      ))}
      {tracks.length === 0 && <div className="empty-state">Пока нет треков. Создайте первый!</div>}
    </div>
  );
}

function DeckCard({
  track,
  onOpen,
  onDelete,
}: {
  track: Track;
  onOpen: (t: Track) => void;
  onDelete: (id: string) => void;
}) {
  const { profile } = useAuth();
  const isMine = track.createdBy === profile?.uid;
  const doneCount = (track.checklist || []).filter((c) => c.status === 'done' || c.status === 'verified').length;
  const total = (track.checklist || []).length;
  const progress = total ? Math.round((doneCount / total) * 100) : 0;

  const artists = track.artists?.join(', ') || track.artistsString || (track as any).artist || '—';

  return (
    <div className="deck-card" onClick={() => onOpen(track)}>
      <div className="deck-cover-wrap">
        {track.coverUrl ? (
          <img className="deck-cover-img" src={track.coverUrl} alt={track.title} />
        ) : (
          <div className="deck-cover-fallback">
            <img className="fallback-img" src={`${import.meta.env.BASE_URL}logo_vtg_default.jpg`} alt="" />
            <span className="deck-title-fallback">{track.title}</span>
          </div>
        )}
        <div className="deck-card-top">
          <span className="deck-num">{track.trackNumber ? String(track.trackNumber).padStart(2, '0') : ''}</span>
          {isMine && <span className="deck-mine">Мой</span>}
        </div>
        <button
          className="deck-delete"
          title="Удалить трек"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(track.id);
          }}
        >
          ×
        </button>
      </div>
      <div className="deck-body">
        <div className="deck-title">{track.title}</div>
        <div className="deck-artists">{artists}</div>
        {track.feat && <div className="deck-feat">feat. {track.feat}</div>}
        <div className="deck-project">{track.project}</div>
        <div className="deck-progress">
          <div className="progress-bar">
            <div className={`progress-fill status-fill-${track.status}`} style={{ width: `${progress}%` }} />
          </div>
          <span className="deck-status">{STATUS_LABELS[track.status]}</span>
        </div>
      </div>
    </div>
  );
}
