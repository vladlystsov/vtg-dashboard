import { DragDropContext, Droppable } from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import type { Track, KanbanColumn, UserProfile } from '../types/track';
import { KANBAN_COLUMNS } from '../types/track';
import TrackCard from './TrackCard';

interface KanbanBoardProps {
  tracks: Track[];
  onOpenTrack: (track: Track) => void;
  onMove: (id: string, column: KanbanColumn) => Promise<void>;
  userMap: Map<string, UserProfile>;
}

export default function KanbanBoard({ tracks, onOpenTrack, onMove, userMap }: KanbanBoardProps) {
  const handleDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId) return;

    const newColumn = destination.droppableId as KanbanColumn;
    onMove(draggableId, newColumn).catch(console.error);
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="kanban-board">
        {KANBAN_COLUMNS.map((col) => {
          const colTracks = tracks.filter((t) => t.column === col.id);
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
