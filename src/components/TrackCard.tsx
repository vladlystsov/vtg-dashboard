import { Draggable } from '@hello-pangea/dnd';
import type { Track } from '../types/track';
import { KANBAN_COLUMNS, STATUS_LABELS } from '../types/track';
import { format } from 'date-fns';

interface TrackCardProps {
  track: Track;
  index: number;
  onOpen: (track: Track) => void;
}

export default function TrackCard({ track, index, onOpen }: TrackCardProps) {
  const doneCount = track.checklist.filter((c) => c.status === 'verified' || c.status === 'done').length;
  const totalCount = track.checklist.length;
  const progress = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
  const currentColumn = KANBAN_COLUMNS.find((c) => c.id === track.column);

  return (
    <Draggable draggableId={track.id} index={index}>
      {(provided) => (
        <div
          className="track-card"
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => onOpen(track)}
          style={{
            ...provided.draggableProps.style,
            borderLeftColor: currentColumn?.color,
          }}
        >
          <div className="track-card-header">
            <div className={`priority-indicator priority-${track.priority}`}></div>
            <span className="track-project">{track.project}</span>
          </div>
          <h3 className="track-title">{track.title}</h3>
          <div className="track-meta">
            <span className="track-artist">{track.artist}</span>
            {track.beatmaker && <span className="track-beatmaker">• {track.beatmaker}</span>}
          </div>
          <div className="track-progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="progress-text">
              {doneCount}/{totalCount}
            </span>
          </div>
          <div className="track-card-footer">
            <span className="track-status">{STATUS_LABELS[track.status]}</span>
            {track.checklist.some((c) => c.deadline && c.status !== 'verified' && c.status !== 'done') && (
              <span className="track-deadline">
                ⏱ {format(new Date(track.checklist.find((c) => c.deadline && c.status !== 'verified' && c.status !== 'done')!.deadline!), 'dd.MM')}
              </span>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
}
