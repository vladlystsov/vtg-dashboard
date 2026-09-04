import { useState, useMemo } from 'react';
import type { Track, UserProfile, ReleaseType } from '../types/track';
import { STATUS_LABELS, RELEASE_TYPE_LABELS, autoDetectReleaseType, asArray } from '../types/track';
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
  authorName: string;
  tracks: Track[];
  coverUrl?: string;
  releaseType: ReleaseType;
  detectedType: Exclude<ReleaseType, 'auto'>;
}

export default function TracksListView({ tracks, userMap, onOpen, onDelete }: TracksListViewProps) {
  const [tab, setTab] = useState<'singles' | 'compilations'>('singles');
  const [filterArtist, setFilterArtist] = useState('');

  const allArtistNames = useMemo(() => {
    const names = new Set<string>();
    for (const t of tracks) {
      for (const uid of t.artistUids || []) {
        const u = userMap.get(uid);
        const name = u?.artistName || u?.displayName;
        if (name) names.add(name);
      }
      for (const a of t.artists || []) {
        if (a) names.add(a);
      }
    }
    return Array.from(names).sort();
  }, [tracks, userMap]);

  const filteredTracks = useMemo(() => {
    if (!filterArtist) return tracks;
    const low = filterArtist.toLowerCase();
    return tracks.filter((t) => {
      const allNames = [
        ...(t.artistUids || []).map((uid) => {
          const u = userMap.get(uid);
          return u?.artistName || u?.displayName || '';
        }),
        ...(t.artists || []),
      ].map((n) => n.toLowerCase());
      return allNames.includes(low);
    });
  }, [tracks, filterArtist, userMap]);

  const singles = useMemo(() => filteredTracks.filter((t) => !t.project), [filteredTracks]);
  const compilations = useMemo(() => filteredTracks.filter((t) => !!t.project), [filteredTracks]);

  const grouped = useMemo(() => groupByProject(compilations, userMap), [compilations, userMap]);

  return (
    <div className="tracks-view">
      <div className="tracks-toolbar">
        <div className="tracks-tabs">
          <button className={`tracks-tab ${tab === 'singles' ? 'active' : ''}`} onClick={() => setTab('singles')}>
            Синглы ({singles.length})
          </button>
          <button className={`tracks-tab ${tab === 'compilations' ? 'active' : ''}`} onClick={() => setTab('compilations')}>
            Сборники ({compilations.length})
          </button>
        </div>
        <div className="tracks-filter">
          <select value={filterArtist} onChange={(e) => setFilterArtist(e.target.value)}>
            <option value="">Все артисты</option>
            {allArtistNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
      </div>

      {tab === 'singles' && (
        <div className="albums-grid">
          {singles.map((track) => (
            <SingleTrackCard
              key={track.id}
              track={track}
              userMap={userMap}
              onOpen={onOpen}
              onDelete={onDelete}
            />
          ))}
          {singles.length === 0 && <div className="empty-state">Нет синглов</div>}
        </div>
      )}

      {tab === 'compilations' && (
        <div className="albums-grid">
          {grouped.map((album) => (
            <AlbumCard key={album.name} album={album} userMap={userMap} onOpen={onOpen} onDelete={onDelete} />
          ))}
          {grouped.length === 0 && <div className="empty-state">Нет сборников</div>}
        </div>
      )}
    </div>
  );
}

function getTrackAuthorName(track: Track, userMap: Map<string, UserProfile>): string {
  const resolve = (uid: string) => {
    const u = userMap.get(uid);
    return u?.artistName || u?.displayName || '';
  };
  const resolved = (track.artistUids || []).map(resolve).filter(Boolean);
  const stored = track.artists || [];
  const seen = new Set<string>();
  for (const n of [...resolved, ...stored]) {
    const key = n.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      return n;
    }
  }
  return '';
}

function groupByProject(tracks: Track[], userMap: Map<string, UserProfile>): AlbumGroup[] {
  const map = new Map<string, Track[]>();
  for (const t of tracks) {
    const key = t.project || '';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }
  const groups: AlbumGroup[] = [];
  for (const [name, albumTracks] of map) {
    if (!name) continue;
    albumTracks.sort((a, b) => (a.trackNumber || 0) - (b.trackNumber || 0));
    const detected = autoDetectReleaseType(albumTracks.length);
    const overrideType = albumTracks[0]?.releaseType;
    const authorName = getTrackAuthorName(albumTracks[0], userMap);
    const displayName = authorName ? `${authorName} — ${name}` : name;
    groups.push({
      name: displayName,
      authorName,
      tracks: albumTracks,
      coverUrl: albumTracks.find((t) => t.coverUrl)?.coverUrl,
      releaseType: overrideType || 'auto',
      detectedType: detected,
    });
  }
  groups.sort((a, b) => a.name.localeCompare(b.name));
  return groups;
}

function resolveName(uid: string, userMap: Map<string, UserProfile>): string {
  const u = userMap.get(uid);
  return u?.artistName || u?.displayName || uid;
}

function isMineByNames(track: Track, myName: string, userMap: Map<string, UserProfile>): boolean {
  const resolved = [
    ...(track.artistUids || []).map((uid) => resolveName(uid, userMap)),
    ...(track.beatmakerUids || []).map((uid) => resolveName(uid, userMap)),
    ...(track.mixByUids || []).map((uid) => resolveName(uid, userMap)),
  ];
  const stored = [
    ...(track.artists || []),
    ...(track.beatmakers || []),
    ...asArray(track.mixBy),
    track.feat || '',
  ];
  const seen = new Set<string>();
  const allNames: string[] = [];
  for (const n of [...resolved, ...stored]) {
    const key = n.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      allNames.push(key);
    }
  }
  return allNames.includes(myName);
}

function getChecklistProgress(checklist: Track['checklist']): { done: number; total: number; pct: number } {
  const cl = checklist || [];
  const total = cl.length;
  const done = cl.filter((c) => c.status === 'done' || c.status === 'verified').length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

function artistNamesStr(track: Track, userMap: Map<string, UserProfile>): string {
  const resolved = (track.artistUids || []).map((uid) => resolveName(uid, userMap));
  const stored = track.artists || [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of [...resolved, ...stored]) {
    const key = n.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(n);
    }
  }
  return out.join(', ');
}

function SingleTrackCard({
  track,
  userMap,
  onOpen,
  onDelete,
}: {
  track: Track;
  userMap: Map<string, UserProfile>;
  onOpen: (t: Track) => void;
  onDelete: (id: string) => void;
}) {
  const { profile } = useAuth();
  const effectiveIsOwner = profile?.role === 'owner' || profile?.role === 'admin';
  const myName = (profile?.artistName || profile?.displayName || '').toLowerCase();
  const { done, total, pct } = getChecklistProgress(track.checklist);
  const isMine = isMineByNames(track, myName, userMap);
  const authorName = artistNamesStr(track, userMap);

  return (
    <div className="album-card album-card-single" onClick={() => onOpen(track)}>
      <div className="album-cover-full">
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
        {track.coverUrl ? (
          <img className="album-cover-img" src={track.coverUrl} alt={track.title} />
        ) : (
          <div className="album-cover-fallback">
            <img className="fallback-img" src={`${import.meta.env.BASE_URL}logo_vtg_default.jpg`} alt="" />
          </div>
        )}
      </div>
      <div className="album-main">
        <div className="album-track-bottom-row">
          <div className="album-track-bottom-left">
            <div className="album-track-title-text">
              {authorName && <span className="album-track-author">{authorName} — </span>}
              {track.title}
              {isMine && <span className="at-mine">Мой</span>}
            </div>
          </div>
          <div className="album-track-bottom-right">
            {(isMine || effectiveIsOwner) && (
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
        </div>
        <div className="album-track-status-row">
          <div className="album-track-progress-row">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="progress-text">{done}/{total}</span>
          </div>
          <span className={`at-status status-${track.status}`}>{STATUS_LABELS[track.status]}</span>
        </div>
      </div>
    </div>
  );
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
  const isOwnerOrAdmin = profile?.role === 'owner' || profile?.role === 'admin';
  const myName = (profile?.artistName || profile?.displayName || '').toLowerCase();
  const [expanded, setExpanded] = useState(false);

  const effectiveType = album.releaseType === 'auto' ? album.detectedType : album.releaseType;
  const typeLabel = RELEASE_TYPE_LABELS[effectiveType];

  const overallStatus = album.tracks.every((t) => t.status === 'ready')
    ? 'ready'
    : album.tracks.some((t) => t.status === 'mixing' || t.status === 'mastering')
    ? 'mixing'
    : album.tracks.some((t) => t.status === 'recording')
    ? 'recording'
    : 'draft';

  const readyCount = album.tracks.filter((t) => t.status === 'ready').length;
  const totalTracks = album.tracks.length;
  const progressPct = totalTracks ? Math.round((readyCount / totalTracks) * 100) : 0;

  return (
    <div className="album-card">
      <div className="album-cover-full">
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
            <div className="progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="progress-text">{readyCount}/{totalTracks}</span>
          <span className={`at-status status-${overallStatus}`}>{STATUS_LABELS[overallStatus]}</span>
        </div>
        <button
          className="album-tracklist-toggle"
          onClick={(e) => { e.stopPropagation(); setExpanded((p) => !p); }}
        >
          {expanded ? '▲ Скрыть треклист' : `▼ Текст трека (${totalTracks})`}
        </button>
        {expanded && (
          <div className="album-tracklist">
            {album.tracks.map((t) => (
              <AlbumTrackRow
                key={t.id}
                track={t}
                userMap={userMap}
                myName={myName}
                isOwnerOrAdmin={isOwnerOrAdmin}
                onOpen={onOpen}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AlbumTrackRow({
  track,
  userMap,
  myName,
  isOwnerOrAdmin,
  onOpen,
  onDelete,
}: {
  track: Track;
  userMap: Map<string, UserProfile>;
  myName: string;
  isOwnerOrAdmin: boolean;
  onOpen: (t: Track) => void;
  onDelete: (id: string) => void;
}) {
  const { done, total, pct } = getChecklistProgress(track.checklist);
  const isMine = isMineByNames(track, myName, userMap);

  return (
    <div className="album-track-row" onClick={() => onOpen(track)}>
      <div className="at-row-top">
        <div className="at-num">{track.trackNumber ?? ''}</div>
        <div className="at-info">
          <div className="at-title-line">
            <span className="at-title">{track.title}</span>
            {isMine && <span className="at-mine">Мой</span>}
          </div>
          {artistNamesStr(track, userMap) && <div className="at-artists">{artistNamesStr(track, userMap)}</div>}
        </div>
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
      <div className="at-bottom">
        <div className="at-progress-cell">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="progress-text">{done}/{total}</span>
        </div>
        <span className={`at-status status-${track.status}`}>{STATUS_LABELS[track.status]}</span>
      </div>
    </div>
  );
}
