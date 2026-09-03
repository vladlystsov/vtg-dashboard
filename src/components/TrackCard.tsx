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
  const checklist = track.checklist || [];
  const doneCount = checklist.filter((c) => c.status === 'verified' || c.status === 'done').length;
  const totalCount = checklist.length;
  const progress = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
  const currentColumn = KANBAN_COLUMNS.find((c) => c.id === track.column);

  const artists = (track.artists || []).length
    ? (track.artists || []).join(', ')
    : track.artistsString || (track as any).artist || '';
  const beatmakers = (track.beatmakers || []).length
    ? (track.beatmakers || []).join(', ')
    : track.beatmakerString || (track as any).beatmaker || '';

  const nextDeadline = (checklist || []).find((c) => c.deadline && c.status !== 'verified' && c.status !== 'done');

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
          {track.coverUrl && (
            <div className="track-card-cover">
              <img src={track.coverUrl} alt={track.title} />
            </div>
          )}
          <div className="track-card-header">
            <div className={`priority-indicator priority-${track.priority}`}></div>
            <span className="track-project">
              {track.trackNumber ? `${track.trackNumber}. ` : ''}{track.project}
            </span>
          </div>
          <h3 className="track-title">{track.title}</h3>
          <div className="track-meta">
            <span className="track-artist">{artists || '—'}</span>
            {track.feat && <span className="track-feat">feat. {track.feat}</span>}
          </div>
          {beatmakers && (
            <div className="track-beatmaker-line">
              <span className="track-beatmaker-label">BT:</span> {beatmakers}
            </div>
          )}
          {track.mixBy && (
            <div className="track-mix-line">
              <span className="track-mix-label">Mix:</span> {track.mixBy}
            </div>
          )}
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
            {nextDeadline && (
              <span className="track-deadline">
                ⏱ {format(new Date(nextDeadline.deadline!), 'dd.MM')}
              </span>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
}
