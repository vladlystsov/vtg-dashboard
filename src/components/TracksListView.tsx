import type { Track } from '../types/track';
import { KANBAN_COLUMNS, STATUS_LABELS } from '../types/track';
import { useAuth } from '../contexts/AuthContext';

interface TracksListViewProps {
  tracks: Track[];
  onOpen: (track: Track) => void;
  onDelete: (id: string) => void;
}

export default function TracksListView({ tracks, onOpen, onDelete }: TracksListViewProps) {
  const { profile } = useAuth();
  return (
    <div className="tracks-list">
      {tracks.map((track) => {
        const col = KANBAN_COLUMNS.find((c) => c.id === track.column);
        const isMine = track.createdBy === profile?.uid;
        return (
          <div className="track-list-row" key={track.id} onClick={() => onOpen(track)}>
            <div className="row-title">
              <span className="row-dot" style={{ backgroundColor: col?.color }} />
              <span className="row-name">{track.title}</span>
              {isMine && <span className="row-mine">Мой</span>}
            </div>
            <div className="row-artist">{track.artist}</div>
            <div className="row-project">{track.project}</div>
            <div className={`row-status status-${track.status}`}>{STATUS_LABELS[track.status]}</div>
            <div className="row-progress">
              {track.checklist.filter((c) => c.status === 'done' || c.status === 'verified').length}/
              {track.checklist.length}
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
      })}
      {tracks.length === 0 && <div className="empty-state">Пока нет треков. Создайте первый!</div>}
    </div>
  );
}
