import { useState, useMemo } from 'react';
import type { Track, UserProfile, ReleaseType } from '../types/track';
import { STATUS_LABELS, RELEASE_TYPE_LABELS, autoDetectReleaseType, asArray, resolveNames } from '../types/track';
import { useAuth } from '../contexts/AuthContext';

interface TracksListViewProps {
  tracks: Track[];
  users?: UserProfile[];
  userMap: Map<string, UserProfile>;
  onOpen: (track: Track) => void;
  onDelete: (id: string) => void;
  onUpdateTrack?: (id: string, patch: Partial<Track>) => Promise<void>;
}

interface AlbumGroup {
  name: string;
  authorName: string;
  tracks: Track[];
  coverUrl?: string;
  releaseType: ReleaseType;
  detectedType: Exclude<ReleaseType, 'auto'>;
}

export default function TracksListView({ tracks, userMap, onOpen, onDelete, onUpdateTrack }: TracksListViewProps) {
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
            <AlbumCard key={album.name} album={album} userMap={userMap} onOpen={onOpen} onDelete={onDelete} onUpdateTrack={onUpdateTrack} />
          ))}
          {grouped.length === 0 && <div className="empty-state">Нет сборников</div>}
        </div>
      )}
    </div>
  );
}

function getTrackAuthorName(track: Track, userMap: Map<string, UserProfile>): string {
  return resolveNames(track.artists, track.artistUids, userMap)[0] || '';
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

function isMineByNames(track: Track, myName: string, userMap: Map<string, UserProfile>): boolean {
  const seen = new Set<string>();
  const allNames: string[] = [];

  const check = (key: string) => {
    if (key && !seen.has(key)) {
      seen.add(key);
      allNames.push(key);
    }
  };

  for (const n of resolveNames(track.artists, track.artistUids, userMap)) check(n.toLowerCase());
  for (const n of resolveNames(track.beatmakers, track.beatmakerUids, userMap)) check(n.toLowerCase());
  for (const n of resolveNames(track.mixBy, track.mixByUids, userMap)) check(n.toLowerCase());

  if (track.feat) check(track.feat.toLowerCase());

  return allNames.includes(myName);
}

function getChecklistProgress(checklist: Track['checklist']): { done: number; total: number; pct: number } {
  const cl = checklist || [];
  const total = cl.length;
  const done = cl.filter((c) => c.status === 'done' || c.status === 'verified').length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

function artistNamesStr(track: Track, userMap: Map<string, UserProfile>): string {
  return resolveNames(track.artists, track.artistUids, userMap).join(', ');
}

function beatmakerNamesStr(track: Track, userMap: Map<string, UserProfile>): string {
  return resolveNames(track.beatmakers, track.beatmakerUids, userMap).join(', ');
}

function mixByNamesStr(track: Track, userMap: Map<string, UserProfile>): string {
  return resolveNames(track.mixBy, track.mixByUids, userMap).join(', ');
}

function unionNames(joined: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of joined) {
    if (!part) continue;
    for (const n of part.split(',')) {
      const trimmed = n.trim();
      const key = trimmed.toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        out.push(trimmed);
      }
    }
  }
  return out.join(', ');
}

function splitNames(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(',')) {
    const trimmed = raw.trim();
    const key = trimmed.toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(trimmed);
    }
  }
  return out;
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

  return (
    <div className="album-card album-card-single" onClick={() => onOpen(track)}>
      <div className="album-cover-full">
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
              <span className="album-track-title-name">{track.title}</span>
              {isMine && <span className="at-mine">Мой</span>}
            </div>
            {artistNamesStr(track, userMap) && (
              <div className="album-track-credits">
                {artistNamesStr(track, userMap)}
                {beatmakerNamesStr(track, userMap) && <span className="album-track-credit-role"> (prod. by {beatmakerNamesStr(track, userMap)})</span>}
                {mixByNamesStr(track, userMap) && <span className="album-track-credit-role"> (mix by {mixByNamesStr(track, userMap)})</span>}
              </div>
            )}
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
  onUpdateTrack,
}: {
  album: AlbumGroup;
  userMap: Map<string, UserProfile>;
  onOpen: (t: Track) => void;
  onDelete: (id: string) => void;
  onUpdateTrack?: (id: string, patch: Partial<Track>) => Promise<void>;
}) {
  const { profile } = useAuth();
  const isOwnerOrAdmin = profile?.role === 'owner' || profile?.role === 'admin';
  const myName = (profile?.artistName || profile?.displayName || '').toLowerCase();
  const isMine = album.tracks.some((t) => isMineByNames(t, myName, userMap));
  const [expanded, setExpanded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [producers, setProducers] = useState('');
  const [mixers, setMixers] = useState('');
  const [savingCredits, setSavingCredits] = useState(false);
  const [creditMsg, setCreditMsg] = useState('');

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

  const repTrack = album.tracks[0];

  const trackBeatmakersUnion = unionNames(album.tracks.map((t) => beatmakerNamesStr(t, userMap)));
  const trackMixByUnion = unionNames(album.tracks.map((t) => mixByNamesStr(t, userMap)));
  // Альбомные prod by / mix by хранятся отдельно от треков (не пишутся в первый трек)
  const storedAlbumBeatmakers = splitNames(
    repTrack && repTrack.albumBeatmakers != null
      ? asArray(repTrack.albumBeatmakers).join(', ')
      : trackBeatmakersUnion
  );
  const storedAlbumMixBy = splitNames(
    repTrack && repTrack.albumMixBy != null
      ? asArray(repTrack.albumMixBy).join(', ')
      : trackMixByUnion
  );
  const albumBeatmakersStr = storedAlbumBeatmakers.join(', ');
  const albumMixByStr = storedAlbumMixBy.join(', ');

  const openEdit = () => {
    setProducers(albumBeatmakersStr);
    setMixers(albumMixByStr);
    setCreditMsg('');
    setEditOpen(true);
  };

  const gatherFromTracks = () => {
    setProducers(trackBeatmakersUnion);
    setMixers(trackMixByUnion);
    setCreditMsg('Prod by / mix by собраны из треков альбома.');
  };

  const saveCredits = async () => {
    if (!repTrack) return;
    setSavingCredits(true);
    setCreditMsg('');
    try {
      await onUpdateTrack?.(repTrack.id, {
        albumBeatmakers: splitNames(producers),
        albumMixBy: splitNames(mixers),
      });
      setCreditMsg('Сохранено.');
      setEditOpen(false);
    } catch (e: any) {
      setCreditMsg(e?.message || 'Не удалось сохранить.');
    } finally {
      setSavingCredits(false);
    }
  };

  const creditsChanged = repTrack
    ? splitNames(producers).join(', ') !== albumBeatmakersStr
      || splitNames(mixers).join(', ') !== albumMixByStr
    : false;

  return (
    <div className="album-card">
      <div className="album-cover-full">
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
          <div className="album-title">{album.authorName ? album.name.replace(`${album.authorName} — `, '') : album.name}</div>
          <span className="album-type-badge">{typeLabel}</span>
          {(isMine || isOwnerOrAdmin) && (
            <button
              className="at-delete album-header-delete"
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
          )}
        </div>
        {album.authorName && (
          <div className="album-artist-line">
            {album.authorName}
            {albumBeatmakersStr && <span className="album-track-credit-role"> (prod. by {albumBeatmakersStr})</span>}
            {albumMixByStr && <span className="album-track-credit-role"> (mix by {albumMixByStr})</span>}
          </div>
        )}
        {isOwnerOrAdmin && repTrack && !editOpen && (
          <button className="btn-small-ghost album-credits-edit" onClick={(e) => { e.stopPropagation(); openEdit(); }}>
            Изменить prod by / mix by
          </button>
        )}
        {editOpen && (
          <div className="album-credits-form" onClick={(e) => e.stopPropagation()}>
            <div className="form-group">
              <label>Prod by</label>
              <input value={producers} onChange={(e) => setProducers(e.target.value)} placeholder="Имена через запятую" />
            </div>
            <div className="form-group">
              <label>Mix by</label>
              <input value={mixers} onChange={(e) => setMixers(e.target.value)} placeholder="Имена через запятую" />
            </div>
            <div className="album-credits-actions">
              <button className="btn-secondary" type="button" onClick={gatherFromTracks}>Собрать по трекам</button>
              <button className="btn-primary" type="button" disabled={savingCredits || !creditsChanged} onClick={saveCredits}>
                {savingCredits ? 'Сохранение...' : 'Сохранить'}
              </button>
              <button className="btn-secondary" type="button" onClick={() => setEditOpen(false)}>Отмена</button>
            </div>
            {creditMsg && <div className="form-hint">{creditMsg}</div>}
          </div>
        )}
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
          {expanded ? '▲ Скрыть треклист' : `▼ Треклист (${totalTracks})`}
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
          {(beatmakerNamesStr(track, userMap) || mixByNamesStr(track, userMap)) && (
            <div className="at-credits">
              {beatmakerNamesStr(track, userMap) && <span>(prod. by {beatmakerNamesStr(track, userMap)})</span>}
              {mixByNamesStr(track, userMap) && <span>(mix by {mixByNamesStr(track, userMap)})</span>}
            </div>
          )}
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
