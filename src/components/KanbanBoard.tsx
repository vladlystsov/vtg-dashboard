import { useState, useMemo } from 'react';
import { DragDropContext, Droppable } from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import type { Track, KanbanColumn, UserProfile } from '../types/track';
import { KANBAN_COLUMNS, resolveNames } from '../types/track';
import TrackCard from './TrackCard';

type BoardFilter = 'all' | 'mine_all' | 'mine_artist' | 'participant';

interface KanbanBoardProps {
  tracks: Track[];
  onOpenTrack: (track: Track) => void;
  onMove: (id: string, column: KanbanColumn) => Promise<void>;
  userMap: Map<string, UserProfile>;
  currentUid?: string;
  currentName?: string;
}

const FILTER_OPTIONS: { value: BoardFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'mine_all', label: 'Мои (все)' },
  { value: 'mine_artist', label: 'Мои (артист)' },
  { value: 'participant', label: 'Участник' },
];

function isArtistOnTrack(track: Track, myName: string, userMap: Map<string, UserProfile>): boolean {
  const key = myName.toLowerCase();
  return resolveNames(track.artists, track.artistUids, userMap).some((n) => n.toLowerCase() === key)
    || !!(track.feat && track.feat.trim().toLowerCase() === key);
}

function isParticipantOnTrack(track: Track, myName: string, userMap: Map<string, UserProfile>): boolean {
  const key = myName.toLowerCase();
  return resolveNames(track.beatmakers, track.beatmakerUids, userMap).some((n) => n.toLowerCase() === key)
    || resolveNames(track.mixBy, track.mixByUids, userMap).some((n) => n.toLowerCase() === key);
}

export default function KanbanBoard({ tracks, onOpenTrack, onMove, userMap, currentName }: KanbanBoardProps) {
  const [filter, setFilter] = useState<BoardFilter>('all');

  const myName = (currentName || '').toLowerCase();

  const filteredTracks = useMemo(() => {
    if (filter === 'all') return tracks;
    if (!myName) return tracks;
    return tracks.filter((t) => {
      const isArtist = isArtistOnTrack(t, myName, userMap);
      const isParticipant = isParticipantOnTrack(t, myName, userMap);
      switch (filter) {
        case 'mine_all': return isArtist || isParticipant;
        case 'mine_artist': return isArtist;
        case 'participant': return isParticipant && !isArtist;
        default: return true;
      }
    });
  }, [tracks, filter, myName, userMap]);

  const handleDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId) return;

    const newColumn = destination.droppableId as KanbanColumn;
    onMove(draggableId, newColumn).catch(console.error);
  };

  return (
    <div className="kanban-wrapper">
      <div className="kanban-filter">
        <span className="kanban-filter-label">Фильтр:</span>
        <div className="kanban-filter-btns">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`kanban-filter-btn ${filter === opt.value ? 'active' : ''}`}
              onClick={() => setFilter(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="kanban-board">
          {KANBAN_COLUMNS.map((col) => {
            const colTracks = filteredTracks.filter((t) => t.column === col.id);
            return (
              <div className="kanban-column" key={col.id}>
                <div className="column-header" style={{ borderBottomColor: col.color }}>
                  <span className="column-dot" style={{ backgroundColor: col.color }} />
                  <span className="column-title">{col.title}</span>
                  <span className="column-count">{colTracks.length}</span>
                </div>
                <Droppable droppableId={col.id}>
                  {(provided) => (
                    <div
                      className="column-body"
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                    >
                      {colTracks.map((track, index) => (
                        <TrackCard
                          key={track.id}
                          track={track}
                          index={index}
                          onOpen={onOpenTrack}
                          userMap={userMap}
                        />
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>
    </div>
  );
}
