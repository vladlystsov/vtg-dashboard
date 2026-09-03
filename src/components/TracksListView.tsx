import type { Track } from '../types/track';
import { STATUS_LABELS } from '../types/track';
import { useAuth } from '../contexts/AuthContext';

interface TracksListViewProps {
  tracks: Track[];
  onOpen: (track: Track) => void;
  onDelete: (id: string) => void;
}

export default function TracksListView({ tracks, onOpen, onDelete }: TracksListViewProps) {
  return (
    <div className="albums-grid">
      {tracks
        .filter((t) => t.coverUrl || t.project)
        .slice()
        .sort((a, b) => (a.trackNumber || 0) - (b.trackNumber || 0))
        .map((track) => (
          <TrackRow key={track.id} track={track} onOpen={onOpen} onDelete={onDelete} />
        ))}
      {tracks.length === 0 && <div className="empty-state">Пока нет треков. Создайте первый!</div>}
    </div>
  );
}

function TrackRow({
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

  return (
    <div className="album-track" onClick={() => onOpen(track)}>
      <div className="album-track-num">
        {track.trackNumber ? String(track.trackNumber).padStart(2, '0') : ''}
      </div>
      <div className="album-track-cover">
        {track.coverUrl ? (
          <img src={track.coverUrl} alt={track.title} />
        ) : (
          <div className="album-track-cover-empty">VTG</div>
        )}
      </div>
      <div className="album-track-info">
        <div className="album-track-title">
          {track.title}
          {isMine && <span className="row-mine">Мой</span>}
        </div>
        <div className="album-track-artists">
          {track.artists?.join(', ') || track.artistsString || (track as any).artist || '—'}
          {track.feat && <span className="track-feat"> feat. {track.feat}</span>}
        </div>
        <div className="album-track-proj">{track.project}</div>
      </div>
      <div className="album-track-meta">
        <span className={`album-track-status status-${track.status}`}>
          {STATUS_LABELS[track.status]}
        </span>
        <span className="album-track-progress">
          {doneCount}/{(track.checklist || []).length}
        </span>
      </div>
      <button
        className="row-delete"
        title="Удалить трек"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(track.id);
        }}
      >
        ×
      </button>
    </div>
  );
}
