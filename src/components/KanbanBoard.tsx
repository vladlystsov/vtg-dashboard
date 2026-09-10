import { useState, useMemo, useCallback } from 'react';
import { DragDropContext, Droppable } from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import type { Track, KanbanColumn, UserProfile } from '../types/track';
import { KANBAN_COLUMNS, resolveNames } from '../types/track';
import TrackCard from './TrackCard';

type BoardFilter = 'mine_all' | 'mine_artist' | 'participant' | 'all';

interface KanbanBoardProps {
  tracks: Track[];
  onOpenTrack: (track: Track) => void;
  onMove: (id: string, column: KanbanColumn) => Promise<void>;
  onArchive: (id: string, archived: boolean) => Promise<void>;
  userMap: Map<string, UserProfile>;
  currentUid?: string;
  currentName?: string;
}

const ARCHIVE_ID = 'archive';

const FILTER_OPTIONS: { value: BoardFilter; label: string }[] = [
  { value: 'mine_all', label: 'Мои (Все)' },
  { value: 'mine_artist', label: 'Мои (артист)' },
  { value: 'participant', label: 'Участник' },
  { value: 'all', label: 'Все' },
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

export default function KanbanBoard({ tracks, onOpenTrack, onMove, onArchive, userMap, currentName }: KanbanBoardProps) {
  const [filter, setFilter] = useState<BoardFilter>('mine_all');
  const [archiveOpen, setArchiveOpen] = useState(false);

  const myName = (currentName || '').toLowerCase();

  const filteredTracks = useMemo(() => {
    const apply = (track: Track): boolean => {
      if (filter === 'all' || !myName) return true;
      const isArtist = isArtistOnTrack(track, myName, userMap);
      const isParticipant = isParticipantOnTrack(track, myName, userMap);
      switch (filter) {
        case 'mine_all': return isArtist || isParticipant;
        case 'mine_artist': return isArtist;
        case 'participant': return isParticipant && !isArtist;
        default: return true;
      }
    };
    return tracks.filter(apply);
  }, [tracks, filter, myName, userMap]);

  const archivedTracks = filteredTracks.filter((t) => t.archived);

  const handleDragEnd = useCallback((result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId) return;

    if (destination.droppableId === ARCHIVE_ID) {
      onArchive(draggableId, true).catch(console.error);
      return;
    }
    if (source.droppableId === ARCHIVE_ID) {
      onArchive(draggableId, false).catch(console.error);
      return;
    }

    const newColumn = destination.droppableId as KanbanColumn;
    onMove(draggableId, newColumn).catch(console.error);
  }, [onArchive, onMove]);

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="kanban-toolbar">
        <div className="kanban-filter">
          <span className="kanban-filter-label">Фильтр:</span>
          <div className="kanban-filter-btns">
            {FILTER_OPTIONS.map((opt) => (
              <button
                type="button"
                key={opt.value}
                className={`kanban-filter-btn ${filter === opt.value ? 'active' : ''}`}
                onClick={() => setFilter(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="kanban-board">
        <div className={`kanban-column kanban-column-archive ${archiveOpen ? 'kanban-column-archive-open' : ''}`}>
          <Droppable droppableId={ARCHIVE_ID}>
            {(provided) => (
              <div
                className="kanban-column-archive-window"
                ref={provided.innerRef}
                {...provided.droppableProps}
                onClick={() => setArchiveOpen((v) => !v)}
              >
                <div className="column-header" style={{ borderBottomColor: '#6b7280' }}>
                  <span className="column-dot" style={{ backgroundColor: '#6b7280' }} />
                  <span className="column-title">Архив {archiveOpen ? '▼' : '▶'}</span>
                  <span className="column-count">{archivedTracks.length}</span>
                </div>
                <div className="column-body">
                  {archiveOpen && archivedTracks.length === 0 && (
                    <div className="kanban-archive-empty">Пусто</div>
                  )}
                  {!archiveOpen && (
                    <div className="kanban-archive-note">Перетащите сюда, чтобы заархивировать</div>
                  )}
                  {archiveOpen && archivedTracks.map((track, index) => (
                    <TrackCard
                      key={track.id}
                      track={track}
                      index={index}
                      onOpen={onOpenTrack}
                      userMap={userMap}
                      onRestore={(id) => onArchive(id, false).catch(console.error)}
                    />
                  ))}
                  {provided.placeholder}
                </div>
                {archiveOpen && (
                  <div className="kanban-archive-hint">
                    Нажмите, чтобы свернуть
                  </div>
                )}
              </div>
            )}
          </Droppable>
        </div>
        {KANBAN_COLUMNS.map((col) => {
          const colTracks = filteredTracks.filter((t) => t.column === col.id && !t.archived);
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
  );
}