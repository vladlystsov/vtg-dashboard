import type { Track } from '../types/track';
import { STATUS_LABELS } from '../types/track';
import { useAuth } from '../contexts/AuthContext';

interface TracksListViewProps {
  tracks: Track[];
  onOpen: (track: Track) => void;
  onDelete: (id: string) => void;
}

interface AlbumGroup {
  name: string;
  tracks: Track[];
  coverUrl?: string;
}

export default function TracksListView({ tracks, onOpen, onDelete }: TracksListViewProps) {
  const grouped = groupByProject(tracks);

  return (
    <div className="albums-list">
      {grouped.map((album) => (
        <AlbumCard key={album.name} album={album} onOpen={onOpen} onDelete={onDelete} />
      ))}
      {tracks.length === 0 && <div className="empty-state">Пока нет треков. Создайте первый!</div>}
    </div>
  );
}

function groupByProject(tracks: Track[]): AlbumGroup[] {
  const map = new Map<string, Track[]>();
  for (const t of tracks) {
    const key = t.project || 'Без альбома';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }
  const groups: AlbumGroup[] = [];
  for (const [name, albumTracks] of map) {
    albumTracks.sort((a, b) => (a.trackNumber || 0) - (b.trackNumber || 0));
    groups.push({
      name,
      tracks: albumTracks,
      coverUrl: albumTracks.find((t) => t.coverUrl)?.coverUrl,
    });
  }
  groups.sort((a, b) => a.name.localeCompare(b.name));
  return groups;
}

function AlbumCard({
  album,
  onOpen,
  onDelete,
}: {
  album: AlbumGroup;
  onOpen: (t: Track) => void;
  onDelete: (id: string) => void;
}) {
  const { profile } = useAuth();
  const totalTracks = album.tracks.length;

  return (
    <div className="album-card">
      <div className="album-cover">
        {album.coverUrl ? (
          <img className="album-cover-img" src={album.coverUrl} alt={album.name} />
        ) : (
          <div className="album-cover-fallback">
            <img className="fallback-img" src={`${import.meta.env.BASE_URL}logo_vtg_default.jpg`} alt="" />
          </div>
        )}
        <div className="album-cover-count">{totalTracks} треков</div>
      </div>
      <div className="album-main">
        <div className="album-title">{album.name}</div>
        <div className="album-tracklist">
          {album.tracks.map((track) => (
            <AlbumTrackRow
              key={track.id}
              track={track}
              currentUid={profile?.uid || ''}
              onOpen={onOpen}
              onDelete={onDelete}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function AlbumTrackRow({
  track,
  currentUid,
  onOpen,
  onDelete,
}: {
  track: Track;
  currentUid: string;
  onOpen: (t: Track) => void;
  onDelete: (id: string) => void;
}) {
  const isMine = track.createdBy === currentUid;
  const artists = (track.artists || []).length
    ? (track.artists || []).join(', ')
    : track.artistsString || '';

  return (
    <div className="album-track-row" onClick={() => onOpen(track)}>
      <div className="at-num">{track.trackNumber ?? ''}</div>
      <div className="at-info">
        <div className="at-title">
          {track.title}
          {isMine && <span className="at-mine">Мой</span>}
        </div>
        {artists && <div className="at-artists">{artists}</div>}
      </div>
      <span className={`at-status status-${track.status}`}>{STATUS_LABELS[track.status]}</span>
      <button
        className="at-delete"
        title="Удалить"
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
