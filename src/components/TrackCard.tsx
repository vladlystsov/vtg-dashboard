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
          className="track-card track-card-portrait"
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => onOpen(track)}
          style={{
            ...provided.draggableProps.style,
          }}
        >
          <div className="track-card-cover-wrap">
            {track.coverUrl ? (
              <img className="track-card-cover-img" src={track.coverUrl} alt={track.title} />
            ) : (
              <div className="track-card-cover-fallback">
                <img className="fallback-img" src={`${import.meta.env.BASE_URL}logo_vtg_default.jpg`} alt="" />
                <span className="fallback-title">{track.title}</span>
              </div>
            )}
            <div className="track-card-top">
              <span className="track-tracknum">{track.trackNumber || ''}</span>
              <span className={`priority-indicator priority-${track.priority}`} />
            </div>
          </div>

          <div className="track-card-body">
            <h3 className="track-title">{track.title}</h3>
            <div className="track-artist">{artists || '—'}</div>
            {track.feat && <div className="track-feat">feat. {track.feat}</div>}
            <div className="track-card-sub">
              <span className="track-project">{track.project}</span>
              {beatmakers && <span className="track-beatmakers">BT: {beatmakers}</span>}
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
              <span className="track-status" style={{ color: currentColumn?.color }}>
                {STATUS_LABELS[track.status]}
              </span>
              {nextDeadline && (
                <span className="track-deadline">
                  ⏱ {format(new Date(nextDeadline.deadline!), 'dd.MM')}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </Draggable>
  );
}
