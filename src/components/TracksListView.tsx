import type { Track } from '../types/track';
import { STATUS_LABELS } from '../types/track';
import { useAuth } from '../contexts/AuthContext';

interface TracksListViewProps {
  tracks: Track[];
  onOpen: (track: Track) => void;
  onDelete: (id: string) => void;
}

interface AlbumGroup {
  project: string;
  tracks: Track[];
}

export default function TracksListView({ tracks, onOpen, onDelete }: TracksListViewProps) {
  const groups = buildGroups(tracks);

  return (
    <div className="albums-list">
      {groups.map((group) => (
        <AlbumCard key={group.project} group={group} onOpen={onOpen} onDelete={onDelete} />
      ))}
      {tracks.length === 0 && <div className="empty-state">Пока нет треков. Создайте первый!</div>}
    </div>
  );
}

function buildGroups(tracks: Track[]): AlbumGroup[] {
  const map = new Map<string, Track[]>();
  for (const t of tracks) {
    const key = t.project || 'Без проекта';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }
  const groups: AlbumGroup[] = [];
  for (const [project, list] of map.entries()) {
    list.sort((a, b) => (a.trackNumber || 0) - (b.trackNumber || 0) || a.title.localeCompare(b.title));
    groups.push({ project, tracks: list });
  }
  return groups;
}

function AlbumCard({
  group,
  onOpen,
  onDelete,
}: {
  group: AlbumGroup;
  onOpen: (t: Track) => void;
  onDelete: (id: string) => void;
}) {
  const first = group.tracks[0];
  const cover = group.tracks.find((t) => t.coverUrl) || first;

  return (
    <div className="album-card">
      <div className="album-cover">
        {cover?.coverUrl ? (
          <img className="album-cover-img" src={cover.coverUrl} alt={group.project} />
        ) : (
          <div className="album-cover-fallback">
            <img className="fallback-img" src={`${import.meta.env.BASE_URL}logo_vtg_default.jpg`} alt="" />
          </div>
        )}
        <span className="album-cover-count">{group.tracks.length}</span>
      </div>

      <div className="album-main">
        <div className="album-head">
          <h3 className="album-title">{group.project}</h3>
        </div>

        <div className="album-tracklist">
          {group.tracks.map((track) => (
            <TrackRow key={track.id} track={track} onOpen={onOpen} onDelete={onDelete} />
          ))}
        </div>
      </div>
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
  const artists = track.artists?.join(', ') || track.artistsString || (track as any).artist || '—';

  return (
    <div className="album-track-row" onClick={() => onOpen(track)}>
      <span className="at-num">{track.trackNumber ? String(track.trackNumber).padStart(2, '0') : ''}</span>
      <div className="at-info">
        <div className="at-title">
          {track.title}
          {isMine && <span className="at-mine">Мой</span>}
        </div>
        <div className="at-artists">
          {artists}
          {track.feat && <span className="track-feat"> feat. {track.feat}</span>}
        </div>
      </div>
      <span className={`at-status status-${track.status}`}>{STATUS_LABELS[track.status]}</span>
      <button
        className="at-delete"
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
