import { Draggable } from '@hello-pangea/dnd';
import type { Track, UserProfile } from '../types/track';
import { KANBAN_COLUMNS, STATUS_LABELS } from '../types/track';
import { format } from 'date-fns';

interface TrackCardProps {
  track: Track;
  index: number;
  onOpen: (track: Track) => void;
  userMap: Map<string, UserProfile>;
}

export default function TrackCard({ track, index, onOpen, userMap }: TrackCardProps) {
  const checklist = track.checklist || [];
  const doneCount = checklist.filter((c) => c.status === 'verified' || c.status === 'done').length;
  const totalCount = checklist.length;
  const progress = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
  const currentColumn = KANBAN_COLUMNS.find((c) => c.id === track.column);

  const resolveName = (uid: string): string => {
    const u = userMap.get(uid);
    return (u?.artistName || u?.displayName || '').trim();
  };

  const artists = (track.artistUids || []).length
    ? (track.artistUids || []).map(resolveName).filter(Boolean).join(', ')
    : (track.artists || []).filter(Boolean).length
    ? (track.artists || []).filter(Boolean).join(', ')
    : track.artistsString || (track as any).artist || '';

  const beatmakers = (track.beatmakerUids || []).length
    ? (track.beatmakerUids || []).map(resolveName).filter(Boolean).join(', ')
    : (track.beatmakers || []).filter(Boolean).length
    ? (track.beatmakers || []).filter(Boolean).join(', ')
    : (track as any).beatmakerString || '';

  const mixByArr: string[] = (track.mixByUids || []).length
    ? (track.mixByUids || []).map(resolveName).filter(Boolean)
    : Array.isArray(track.mixBy)
    ? (track.mixBy || []).filter(Boolean)
    : track.mixBy
    ? [String(track.mixBy)]
    : [];
  const mixBy = mixByArr.join(', ');

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
            <div className="track-card-thumb">
              <img src={track.coverUrl} alt="" />
            </div>
          )}
          <div className="track-card-content">
            <div className="track-card-header">
              <div className={`priority-indicator priority-${track.priority}`} />
              <span className="track-project">
                {track.trackNumber ? `${track.trackNumber}. ` : ''}{track.project}
              </span>
            </div>
            <h3 className="track-title">{track.title}</h3>
            <div className="track-meta">
              <span className="track-artist">{artists || '—'}</span>
              {track.feat && <span className="track-feat">feat. {track.feat}</span>}
            </div>
            {(beatmakers || mixBy) && (
              <div className="track-credits-line">
                {beatmakers && <span className="track-credit">prod. by {beatmakers}</span>}
                {mixBy && <span className="track-credit">mix by {mixBy}</span>}
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
                  {format(new Date(nextDeadline.deadline!), 'dd.MM')}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </Draggable>
  );
}
