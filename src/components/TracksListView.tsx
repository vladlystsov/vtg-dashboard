import type { Track, UserProfile, ReleaseType } from '../types/track';
import { STATUS_LABELS, RELEASE_TYPE_LABELS, autoDetectReleaseType } from '../types/track';
import { useAuth } from '../contexts/AuthContext';

interface TracksListViewProps {
  tracks: Track[];
  users?: UserProfile[];
  userMap: Map<string, UserProfile>;
  onOpen: (track: Track) => void;
  onDelete: (id: string) => void;
}

interface AlbumGroup {
  name: string;
  tracks: Track[];
  coverUrl?: string;
  releaseType: ReleaseType;
  detectedType: Exclude<ReleaseType, 'auto'>;
}

export default function TracksListView({ tracks, userMap, onOpen, onDelete }: TracksListViewProps) {
  const grouped = groupByProject(tracks);

  return (
    <div className="albums-grid">
      {grouped.map((album) => (
        <AlbumCard key={album.name} album={album} userMap={userMap} onOpen={onOpen} onDelete={onDelete} />
      ))}
      {tracks.length === 0 && <div className="empty-state">Пока нет треков. Создайте первый!</div>}
    </div>
  );
}

function groupByProject(tracks: Track[]): AlbumGroup[] {
  const map = new Map<string, Track[]>();
  for (const t of tracks) {
    const key = t.project || '';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }
  const groups: AlbumGroup[] = [];
  for (const [name, albumTracks] of map) {
    albumTracks.sort((a, b) => (a.trackNumber || 0) - (b.trackNumber || 0));
    const detected = autoDetectReleaseType(albumTracks.length);
    const overrideType = albumTracks[0]?.releaseType;
    groups.push({
      name: name || albumTracks[0]?.title || 'Без названия',
      tracks: albumTracks,
      coverUrl: albumTracks.find((t) => t.coverUrl)?.coverUrl,
      releaseType: overrideType || 'auto',
      detectedType: detected,
    });
  }
  groups.sort((a, b) => a.name.localeCompare(b.name));
  return groups;
}

function AlbumCard({
  album,
  userMap,
  onOpen,
  onDelete,
}: {
  album: AlbumGroup;
  userMap: Map<string, UserProfile>;
  onOpen: (t: Track) => void;
  onDelete: (id: string) => void;
}) {
  const { profile } = useAuth();
  const isSingleTrack = album.tracks.length === 1 && !album.tracks[0].project;
  const track = isSingleTrack ? album.tracks[0] : null;

  const isOwnerOrAdmin = profile?.role === 'owner' || profile?.role === 'admin';

  const resolveName = (uid: string): string => {
    const u = userMap.get(uid);
    return u?.artistName || u?.displayName || uid;
  };

  if (isSingleTrack && track) {
    return (
      <SingleTrackCard
        track={track}
        profile={profile}
        resolveName={resolveName}
        onOpen={onOpen}
        onDelete={onDelete}
      />
    );
  }

  const totalTracks = album.tracks.length;
  const doneCount = album.tracks.filter((t) => {
    const cl = t.checklist || [];
    return cl.length > 0 && cl.every((c) => c.status === 'done' || c.status === 'verified');
  }).length;
  const progress = totalTracks ? Math.round((doneCount / totalTracks) * 100) : 0;

  const effectiveType = album.releaseType === 'auto' ? album.detectedType : album.releaseType;
  const typeLabel = RELEASE_TYPE_LABELS[effectiveType];

  const overallStatus = album.tracks.every((t) => t.status === 'ready')
    ? 'ready'
    : album.tracks.some((t) => t.status === 'mixing' || t.status === 'mastering')
    ? 'mixing'
    : album.tracks.some((t) => t.status === 'recording')
    ? 'recording'
    : 'draft';

  const myName = (profile?.artistName || profile?.displayName || '').toLowerCase();

  return (
    <div className="album-card">
      <button
        className="album-delete-btn"
        title="Удалить альбом"
        onClick={(e) => {
          e.stopPropagation();
          if (confirm(`Удалить все треки альбома «${album.name}»?`)) {
            album.tracks.forEach((t) => onDelete(t.id));
          }
        }}
      >
        ×
      </button>
      <div className="album-cover">
        {album.coverUrl ? (
          <img className="album-cover-img" src={album.coverUrl} alt={album.name} />
        ) : (
          <div className="album-cover-fallback">
            <img className="fallback-img" src={`${import.meta.env.BASE_URL}logo_vtg_default.jpg`} alt="" />
          </div>
        )}
      </div>
      <div className="album-main">
        <div className="album-header-row">
          <div className="album-title">{album.name}</div>
          <span className="album-type-badge">{typeLabel}</span>
        </div>
        <div className="album-progress-row">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="progress-text">{doneCount}/{totalTracks}</span>
          <span className={`at-status status-${overallStatus}`}>{STATUS_LABELS[overallStatus]}</span>
        </div>
        <div className="album-tracklist">
          {album.tracks.map((t) => (
            <AlbumTrackRow
              key={t.id}
              track={t}
              resolveName={resolveName}
              myName={myName}
              isOwnerOrAdmin={isOwnerOrAdmin}
              onOpen={onOpen}
              onDelete={onDelete}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SingleTrackCard({
  track,
  profile,
  resolveName,
  onOpen,
  onDelete,
}: {
  track: Track;
  profile: UserProfile | null;
  resolveName: (uid: string) => string;
  onOpen: (t: Track) => void;
  onDelete: (id: string) => void;
}) {
  const doneCount = (track.checklist || []).filter((c) => c.status === 'done' || c.status === 'verified').length;
  const total = (track.checklist || []).length;
  const progress = total ? Math.round((doneCount / total) * 100) : 0;

  const artistNames = (track.artistUids || []).length
    ? (track.artistUids || []).map(resolveName).join(', ')
    : (track.artists || []).join(', ');

  const myName = (profile?.artistName || profile?.displayName || '').toLowerCase();
  const allNames = [
    ...(track.artists || []),
    ...(track.artistUids || []).map(resolveName),
    ...(track.beatmakers || []),
    ...(track.beatmakerUids || []).map(resolveName),
    ...(track.mixBy || []),
    ...(track.mixByUids || []).map(resolveName),
    track.feat || '',
  ].map((n) => n.toLowerCase());
  const isMine = allNames.includes(myName);

  return (
    <div className="album-card album-card-single" onClick={() => onOpen(track)}>
      <button
        className="album-delete-btn"
        title="Удалить"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(track.id);
        }}
      >
        ×
      </button>
      <div className="album-cover">
        {track.coverUrl ? (
          <img className="album-cover-img" src={track.coverUrl} alt={track.title} />
        ) : (
          <div className="album-cover-fallback">
            <img className="fallback-img" src={`${import.meta.env.BASE_URL}logo_vtg_default.jpg`} alt="" />
          </div>
        )}
      </div>
      <div className="album-main">
        <div className="album-header-row">
          <div className="album-title">{track.title}</div>
          {isMine && <span className="at-mine">Мой</span>}
        </div>
        {artistNames && <div className="album-artist-line">{artistNames}</div>}
        <div className="album-progress-row">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="progress-text">{doneCount}/{total}</span>
          <span className={`at-status status-${track.status}`}>{STATUS_LABELS[track.status]}</span>
        </div>
      </div>
    </div>
  );
}

function AlbumTrackRow({
  track,
  resolveName,
  myName,
  isOwnerOrAdmin,
  onOpen,
  onDelete,
}: {
  track: Track;
  resolveName: (uid: string) => string;
  myName: string;
  isOwnerOrAdmin: boolean;
  onOpen: (t: Track) => void;
  onDelete: (id: string) => void;
}) {
  const artistNames = (track.artistUids || []).length
    ? (track.artistUids || []).map(resolveName).join(', ')
    : (track.artists || []).join(', ');

  const allNames = [
    ...(track.artists || []),
    ...(track.artistUids || []).map(resolveName),
    ...(track.beatmakers || []),
    ...(track.beatmakerUids || []).map(resolveName),
    ...(track.mixBy || []),
    ...(track.mixByUids || []).map(resolveName),
    track.feat || '',
  ].map((n) => n.toLowerCase());
  const isMine = allNames.includes(myName);

  return (
    <div className="album-track-row" onClick={() => onOpen(track)}>
      <div className="at-num">{track.trackNumber ?? ''}</div>
      <div className="at-info">
        <div className="at-title">
          {track.title}
          {isMine && <span className="at-mine">Мой</span>}
        </div>
        {artistNames && <div className="at-artists">{artistNames}</div>}
      </div>
      <span className={`at-status status-${track.status}`}>{STATUS_LABELS[track.status]}</span>
      {(isMine || isOwnerOrAdmin) && (
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
      )}
    </div>
  );
}
