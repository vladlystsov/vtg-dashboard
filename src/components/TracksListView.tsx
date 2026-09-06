import { useState, useMemo, useRef } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import type { Track, UserProfile, ReleaseType } from '../types/track';
import { STATUS_LABELS, RELEASE_TYPE_LABELS, autoDetectReleaseType, asArray, resolveNames, detectPlatform, soundCloudEmbedSrc, youtubeVideoId } from '../types/track';
import { useAuth } from '../contexts/AuthContext';
import { ShippedMini, toShippedItem } from './ShippedPlayer';
import { uploadCover } from '../services/fileService';

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
  const [tab, setTab] = useState<'singles' | 'compilations' | 'shipped'>('singles');
  const [filterArtist, setFilterArtist] = useState('');
  const [editingAlbum, setEditingAlbum] = useState<AlbumGroup | null>(null);

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

  const isCompleted = (t: Track) => t.status === 'completed';
  const activeSingles = useMemo(() => singles.filter((t) => !isCompleted(t)), [singles]);
  const activeGroups = useMemo(() => grouped.filter((g) => !g.tracks.every(isCompleted)), [grouped]);
  const shippedSingles = useMemo(() => singles.filter((t) => isCompleted(t) || !!t.platformUrl), [singles]);
  const shippedAlbums = useMemo(
    () => grouped.filter((g) => g.tracks.every(isCompleted) || g.tracks.some((t) => !!t.platformUrl)),
    [grouped]
  );

  return (
    <div className="tracks-view">
      <div className="tracks-toolbar">
        <div className="tracks-tabs">
          <button className={`tracks-tab ${tab === 'singles' ? 'active' : ''}`} onClick={() => setTab('singles')}>
            Синглы ({activeSingles.length})
          </button>
          <button className={`tracks-tab ${tab === 'compilations' ? 'active' : ''}`} onClick={() => setTab('compilations')}>
            Сборники ({activeGroups.length})
          </button>
          <button className={`tracks-tab ${tab === 'shipped' ? 'active' : ''}`} onClick={() => setTab('shipped')}>
            Отгружено ({shippedSingles.length + shippedAlbums.length})
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
          {activeSingles.map((track) => (
            <SingleTrackCard
              key={track.id}
              track={track}
              userMap={userMap}
              onOpen={onOpen}
              onDelete={onDelete}
            />
          ))}
          {activeSingles.length === 0 && <div className="empty-state">Нет синглов</div>}
        </div>
      )}

      {tab === 'compilations' && (
        <div className="albums-grid">
          {activeGroups.map((album) => (
            <AlbumCard
              key={album.name}
              album={album}
              userMap={userMap}
              onOpen={onOpen}
              onDelete={onDelete}
              onEditAlbum={() => setEditingAlbum(album)}
            />
          ))}
          {activeGroups.length === 0 && <div className="empty-state">Нет сборников</div>}
        </div>
      )}

      {tab === 'shipped' && (
        <div className="albums-grid">
          {shippedSingles.map((track) => (
            <SingleTrackCard
              key={track.id}
              track={track}
              userMap={userMap}
              onOpen={onOpen}
              onDelete={onDelete}
              shipped
            />
          ))}
          {shippedAlbums.map((album) => (
            <AlbumCard
              key={album.name}
              album={album}
              userMap={userMap}
              onOpen={onOpen}
              onDelete={onDelete}
              shipped
              onEditAlbum={() => setEditingAlbum(album)}
            />
          ))}
          {shippedSingles.length === 0 && shippedAlbums.length === 0 && (
            <div className="empty-state">Нет отгруженных релизов. Отметьте трек статусом «Завершено» или укажите ссылку на платформу в карточке трека.</div>
          )}
        </div>
      )}

      {editingAlbum && (
        <AlbumEditModal
          album={editingAlbum}
          userMap={userMap}
          onUpdateTrack={onUpdateTrack}
          onOpenTrack={onOpen}
          onClose={() => setEditingAlbum(null)}
        />
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
      coverUrl: albumTracks.find((t) => t.coverUrl)?.coverUrl || albumTracks.find((t) => t.personalCoverUrl)?.personalCoverUrl,
      releaseType: overrideType || 'auto',
      detectedType: detected,
    });
  }
  groups.sort((a, b) => a.name.localeCompare(b.name));
  return groups;
}

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

const FALLBACK_COVER = `${import.meta.env.BASE_URL}logo_vtg_default.jpg`;

export function PlatformPlayer({ url, compact = false, hideEmbed = false, track }: { url?: string; compact?: boolean; hideEmbed?: boolean; track?: Track }) {
  if (!url) return null;
  const trimmed = url.trim();
  const kind = detectPlatform(trimmed);
  if (kind === 'soundcloud' || kind === 'youtube') {
    if (hideEmbed) return null;
    if (kind === 'soundcloud') {
      return (
        <div className={`platform-player ${compact ? 'platform-player-compact' : ''}`} onClick={(e) => e.stopPropagation()}>
          <iframe
            title="SoundCloud"
            width="100%"
            height={compact ? 116 : 166}
            frameBorder="0"
            allow="autoplay"
            scrolling="no"
            src={soundCloudEmbedSrc(trimmed)}
          />
        </div>
      );
    }
    const vid = youtubeVideoId(trimmed);
    if (!vid) {
      return (
        <a className="listen-btn" href={trimmed} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
          ▶ Слушать на YouTube
        </a>
      );
    }
    return (
      <div className={`platform-player ${compact ? 'platform-player-compact' : ''}`} onClick={(e) => e.stopPropagation()}>
        <iframe
          title="YouTube"
          width="100%"
          height={compact ? 116 : 200}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          src={`https://www.youtube.com/embed/${vid}?autoplay=0`}
        />
      </div>
    );
  }
  // Прямой аудио-файл (например трек, загруженный на Archive.org) —
  // вместо «Слушать на платформе» показываем плеер с двигающейся точкой
  if (kind === 'audio') {
    if (track) {
      return <ShippedMini item={toShippedItem(track)} />;
    }
    return (
      <a className="listen-btn" href={trimmed} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
        ▶ Слушать аудио
      </a>
    );
  }
  return (
    <a
      className="listen-btn"
      href={trimmed}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
    >
      ▶ Слушать на платформе
    </a>
  );
}

function isPlayerTrack(t: Track): boolean {
  if (!t.platformUrl) return false;
  const k = detectPlatform(t.platformUrl);
  return k === 'soundcloud' || k === 'youtube' || k === 'audio';
}

// Эффективная обложка трека: персональная > своя > обложка альбома
function effectiveTrackCover(track: Track, albumCover?: string): string | undefined {
  return track.personalCoverUrl || track.coverUrl || albumCover;
}

function DownloadAudioButton({ url, title }: { url?: string; title: string }) {
  if (!url || detectPlatform(url) !== 'audio') return null;
  return (
    <a
      className="at-download"
      href={url}
      download={title}
      title="Скачать mp3"
      onClick={(e) => e.stopPropagation()}
    >
      ⬇
    </a>
  );
}

function SingleTrackCard({
  track,
  userMap,
  onOpen,
  onDelete,
  shipped = false,
}: {
  track: Track;
  userMap: Map<string, UserProfile>;
  onOpen: (t: Track) => void;
  onDelete: (id: string) => void;
  shipped?: boolean;
}) {
  const { profile } = useAuth();
  const effectiveIsOwner = profile?.role === 'owner' || profile?.role === 'admin';
  const myName = (profile?.artistName || profile?.displayName || '').toLowerCase();
  const { done, total, pct } = getChecklistProgress(track.checklist);
  const isArtist = isArtistOnTrack(track, myName, userMap);
  const isParticipant = isParticipantOnTrack(track, myName, userMap);
  const badge = isArtist ? 'Мой' : isParticipant ? 'Участник' : null;
  const cover = effectiveTrackCover(track);

  return (
    <div className="album-card album-card-single" onClick={() => onOpen(track)}>
      <div className="album-cover-full">
        {cover ? (
          <img className="album-cover-img" src={cover} alt={track.title} />
        ) : (
          <div className="album-cover-fallback">
            <img className="fallback-img" src={FALLBACK_COVER} alt="" />
          </div>
        )}
      </div>
      <div className="album-main">
        <div className="album-track-bottom-row">
          <div className="album-track-bottom-left">
            <div className="album-track-title-text">
              <span className="album-track-title-name">{track.title}</span>
              {badge && <span className={isArtist ? 'at-mine' : 'at-mine at-participant'}>{badge}</span>}
              {track.archiveStatus === 'uploading' && (
                <span className="at-archive-badge at-archive-uploading" title="Звук публикуется в Archive.org">звук…</span>
              )}
              {track.archiveStatus === 'error' && (
                <span className="at-archive-badge at-archive-error" title={track.archiveError || 'Ошибка публикации звука'}>ошибка звука</span>
              )}
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
            <DownloadAudioButton url={track.platformUrl} title={track.title} />
            {(isArtist || effectiveIsOwner) && (
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
        {shipped ? (
          isPlayerTrack(track) ? (
            <ShippedMini item={toShippedItem(track)} />
          ) : (
            <PlatformPlayer url={track.platformUrl} track={track} />
          )
        ) : (
          <div className="album-track-status-row">
            <div className="album-track-progress-row">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <span className="progress-text">{done}/{total}</span>
            </div>
            <span className={`at-status status-${track.status}`}>{STATUS_LABELS[track.status]}</span>
          </div>
        )}
        {!shipped && <PlatformPlayer url={track.platformUrl} track={track} />}
      </div>
    </div>
  );
}

function AlbumCard({
  album,
  userMap,
  onOpen,
  onDelete,
  onEditAlbum,
  shipped = false,
}: {
  album: AlbumGroup;
  userMap: Map<string, UserProfile>;
  onOpen: (t: Track) => void;
  onDelete: (id: string) => void;
  onEditAlbum: () => void;
  shipped?: boolean;
}) {
  const { profile } = useAuth();
  const myName = (profile?.artistName || profile?.displayName || '').toLowerCase();
  const isMine = album.tracks.some((t) => isArtistOnTrack(t, myName, userMap));
  const isParticipant = album.tracks.some((t) => isParticipantOnTrack(t, myName, userMap))
    || asArray(album.tracks[0]?.albumBeatmakers).some((n) => n.toLowerCase() === myName)
    || asArray(album.tracks[0]?.albumMixBy).some((n) => n.toLowerCase() === myName);
  const albumBadge = isMine ? 'Мой' : isParticipant ? 'Участник' : null;
  const [expanded, setExpanded] = useState(false);

  const effectiveType = album.releaseType === 'auto' ? album.detectedType : album.releaseType;
  const typeLabel = RELEASE_TYPE_LABELS[effectiveType];

  const overallStatus = album.tracks.every((t) => t.status === 'ready' || t.status === 'completed')
    ? 'ready'
    : album.tracks.some((t) => t.status === 'mixing' || t.status === 'mastering')
    ? 'mixing'
    : album.tracks.some((t) => t.status === 'recording')
    ? 'recording'
    : 'draft';

  const readyCount = album.tracks.filter((t) => t.status === 'ready' || t.status === 'completed').length;
  const totalTracks = album.tracks.length;
  const progressPct = totalTracks ? Math.round((readyCount / totalTracks) * 100) : 0;

  const repTrack = album.tracks[0];

  const albumPlatformUrl =
    album.tracks.find((t) => t.platformUrl && (detectPlatform(t.platformUrl) === 'soundcloud' || detectPlatform(t.platformUrl) === 'youtube'))?.platformUrl
    || album.tracks.find((t) => t.platformUrl)?.platformUrl;
  const albumPlatformTrack = album.tracks.find((t) => t.platformUrl === albumPlatformUrl);

  const albumBeatmakersStr = unionNames(album.tracks.map((t) => beatmakerNamesStr(t, userMap)));
  const albumMixByStr = unionNames(album.tracks.map((t) => mixByNamesStr(t, userMap)));
  // Альбомные prod by / mix by хранятся отдельно от треков (не пишутся в первый трек)
  const storedAlbumBeatmakers = repTrack && repTrack.albumBeatmakers != null
    ? splitNames(asArray(repTrack.albumBeatmakers).join(', ')).join(', ')
    : albumBeatmakersStr;
  const storedAlbumMixBy = repTrack && repTrack.albumMixBy != null
    ? splitNames(asArray(repTrack.albumMixBy).join(', ')).join(', ')
    : albumMixByStr;

  return (
    <div className="album-card album-card-editable">
      <div className="album-cover-full" onClick={onEditAlbum}>
        {album.coverUrl ? (
          <img className="album-cover-img" src={album.coverUrl} alt={album.name} />
        ) : (
          <div className="album-cover-fallback">
            <img className="fallback-img" src={FALLBACK_COVER} alt="" />
          </div>
        )}
        <span className="album-edit-hint">Редактировать альбом</span>
      </div>
      <div className="album-main">
        <div className="album-header-row" onClick={onEditAlbum}>
          <div className="album-title">{album.authorName ? album.name.replace(`${album.authorName} — `, '') : album.name}</div>
          {albumBadge && <span className={isMine ? 'at-mine' : 'at-mine at-participant'}>{albumBadge}</span>}
          <span className="album-type-badge">{typeLabel}</span>
        </div>
        {album.authorName && (
          <div className="album-artist-line">
            {album.authorName}
            {storedAlbumBeatmakers && <span className="album-track-credit-role"> (prod. by {storedAlbumBeatmakers})</span>}
            {storedAlbumMixBy && <span className="album-track-credit-role"> (mix by {storedAlbumMixBy})</span>}
          </div>
        )}
        {!shipped && (
          <div className="album-progress-row">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="progress-text">{readyCount}/{totalTracks}</span>
            <span className={`at-status status-${overallStatus}`}>{STATUS_LABELS[overallStatus]}</span>
          </div>
        )}
        {!shipped && <PlatformPlayer url={albumPlatformUrl} track={albumPlatformTrack} />}
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
                albumCover={album.coverUrl}
                userMap={userMap}
                onOpen={onOpen}
                onDelete={onDelete}
                shipped={shipped}
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
  albumCover,
  userMap,
  onOpen,
  onDelete,
  shipped = false,
}: {
  track: Track;
  albumCover?: string;
  userMap: Map<string, UserProfile>;
  onOpen: (t: Track) => void;
  onDelete: (id: string) => void;
  shipped?: boolean;
}) {
  const { profile } = useAuth();
  const myName = (profile?.artistName || profile?.displayName || '').toLowerCase();
  const isArtist = isArtistOnTrack(track, myName, userMap);
  const isOwnerOrAdmin = profile?.role === 'owner' || profile?.role === 'admin';
  const isParticipant = isParticipantOnTrack(track, myName, userMap);
  const badge = isArtist ? 'Мой' : isParticipant ? 'Участник' : null;
  const { done, total, pct } = getChecklistProgress(track.checklist);
  const cover = effectiveTrackCover(track, albumCover);

  return (
    <div className="album-track-row" onClick={() => onOpen(track)}>
      <div className="at-row-top">
        <div className="at-num">{track.trackNumber ?? ''}</div>
        {cover && (
          <div className="at-cover">
            <img src={cover} alt="" />
          </div>
        )}
        <div className="at-info">
          <div className="at-title-line">
            <span className="at-title">{track.title}</span>
            {badge && <span className={isArtist ? 'at-mine' : 'at-mine at-participant'}>{badge}</span>}
            {track.archiveStatus === 'uploading' && (
              <span className="at-archive-badge at-archive-uploading" title="Звук публикуется в Archive.org">звук…</span>
            )}
            {track.archiveStatus === 'error' && (
              <span className="at-archive-badge at-archive-error" title={track.archiveError || 'Ошибка публикации звука'}>ошибка звука</span>
            )}
          </div>
          {artistNamesStr(track, userMap) && <div className="at-artists">{artistNamesStr(track, userMap)}</div>}
          {(beatmakerNamesStr(track, userMap) || mixByNamesStr(track, userMap)) && (
            <div className="at-credits">
              {beatmakerNamesStr(track, userMap) && <span>(prod. by {beatmakerNamesStr(track, userMap)})</span>}
              {mixByNamesStr(track, userMap) && <span>(mix by {mixByNamesStr(track, userMap)})</span>}
            </div>
          )}
        </div>
        <DownloadAudioButton url={track.platformUrl} title={track.title} />
        {track.platformUrl && (
          <a
            className="at-listen"
            href={track.platformUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Слушать на платформе"
            onClick={(e) => e.stopPropagation()}
          >
            ▶
          </a>
        )}
        {(isArtist || isOwnerOrAdmin) && (
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
      {shipped ? (
        isPlayerTrack(track) ? (
          <ShippedMini item={toShippedItem(track)} />
        ) : null
      ) : (
        <div className="at-bottom">
          <div className="at-progress-cell">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="progress-text">{done}/{total}</span>
          </div>
          <span className={`at-status status-${track.status}`}>{STATUS_LABELS[track.status]}</span>
        </div>
      )}
    </div>
  );
}

function AlbumEditModal({
  album,
  userMap,
  onUpdateTrack,
  onOpenTrack,
  onClose,
}: {
  album: AlbumGroup;
  userMap: Map<string, UserProfile>;
  onUpdateTrack?: (id: string, patch: Partial<Track>) => Promise<void>;
  onOpenTrack: (t: Track) => void;
  onClose: () => void;
}) {
  const repTrack = album.tracks[0];

  const trackBeatmakersUnion = unionNames(album.tracks.map((t) => beatmakerNamesStr(t, userMap)));
  const trackMixByUnion = unionNames(album.tracks.map((t) => mixByNamesStr(t, userMap)));

  const [producers, setProducers] = useState(
    repTrack && repTrack.albumBeatmakers != null
      ? splitNames(asArray(repTrack.albumBeatmakers).join(', ')).join(', ')
      : trackBeatmakersUnion
  );
  const [mixers, setMixers] = useState(
    repTrack && repTrack.albumMixBy != null
      ? splitNames(asArray(repTrack.albumMixBy).join(', ')).join(', ')
      : trackMixByUnion
  );
  const [order, setOrder] = useState<Track[]>(() => [...album.tracks]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const gatherFromTracks = () => {
    setProducers(trackBeatmakersUnion);
    setMixers(trackMixByUnion);
    setMsg('Prod by / mix by собраны из треков альбома.');
  };

  const handleRowDrag = (result: DropResult) => {
    const { destination, source } = result;
    if (!destination) return;
    if (destination.index === source.index) return;
    setOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(source.index, 1);
      next.splice(destination.index, 0, moved);
      return next;
    });
  };

  const save = async () => {
    if (!repTrack || !onUpdateTrack) return;
    setSaving(true);
    setError('');
    setMsg('');
    const orderChanged = order.some((t, i) => t.trackNumber !== i + 1);
    try {
      const updates: Promise<void>[] = [];
      const creditsChanged =
        splitNames(producers).join(', ') !== splitNames(repTrack.albumBeatmakers != null ? asArray(repTrack.albumBeatmakers).join(', ') : trackBeatmakersUnion).join(', ')
        || splitNames(mixers).join(', ') !== splitNames(repTrack.albumMixBy != null ? asArray(repTrack.albumMixBy).join(', ') : trackMixByUnion).join(', ');
      if (creditsChanged) {
        updates.push(onUpdateTrack(repTrack.id, {
          albumBeatmakers: splitNames(producers),
          albumMixBy: splitNames(mixers),
        }));
      }
      if (orderChanged) {
        for (const t of order) {
          if (t.trackNumber !== order.indexOf(t) + 1) {
            updates.push(onUpdateTrack(t.id, { trackNumber: order.indexOf(t) + 1 }));
          }
        }
      }
      await Promise.all(updates);
      setMsg('Сохранено.');
    } catch (e: any) {
      setError(e?.message || 'Не удалось сохранить.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="track-form-modal album-edit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Редактирование альбома: {album.name}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="form-section">
          <div className="form-group">
            <label>Prod by (альбом)</label>
            <input value={producers} onChange={(e) => setProducers(e.target.value)} placeholder="Имена через запятую" />
          </div>
          <div className="form-group">
            <label>Mix by (альбом)</label>
            <input value={mixers} onChange={(e) => setMixers(e.target.value)} placeholder="Имена через запятую" />
          </div>
          <div className="album-credits-actions" style={{ marginBottom: 14 }}>
            <button className="btn-secondary" type="button" onClick={gatherFromTracks}>Собрать из треков</button>
            <button className="btn-primary" type="button" disabled={saving} onClick={save}>
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
          {msg && <div className="form-hint">{msg}</div>}
          {error && <div className="form-error" style={{ color: 'var(--crimson-500)' }}>{error}</div>}
        </div>

        <div className="form-section">
          <h3>Треклист альбома (drag-n-drop)</h3>
          <DragDropContext onDragEnd={handleRowDrag}>
            <Droppable droppableId="album-edit-tracklist">
              {(provided) => (
                <div className="album-edit-tracklist" ref={provided.innerRef} {...provided.droppableProps}>
                  {order.map((t, i) => (
                    <AlbumEditTrackRow
                      key={t.id}
                      track={t}
                      index={i}
                      userMap={userMap}
                      albumCover={album.coverUrl}
                      onUpdateTrack={onUpdateTrack}
                      onOpenTrack={onOpenTrack}
                    />
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}

function AlbumEditTrackRow({
  track,
  index,
  userMap,
  albumCover,
  onUpdateTrack,
  onOpenTrack,
}: {
  track: Track;
  index: number;
  userMap: Map<string, UserProfile>;
  albumCover?: string;
  onUpdateTrack?: (id: string, patch: Partial<Track>) => Promise<void>;
  onOpenTrack: (t: Track) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const cover = effectiveTrackCover(track, albumCover);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUpdateTrack) return;
    setUploading(true);
    try {
      const dataUrl = await uploadCover(file);
      await onUpdateTrack(track.id, { personalCoverUrl: dataUrl });
    } catch {
      /* ignore */
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Draggable draggableId={track.id} index={index}>
      {(p) => (
        <div
          className="album-edit-track-row"
          ref={p.innerRef}
          {...p.draggableProps}
          onClick={() => onOpenTrack(track)}
        >
          <span className="sp-grip" {...p.dragHandleProps}>⠿</span>
          <span className="at-num">{index + 1}</span>
          <div className="at-edit-cover">
            {cover ? <img src={cover} alt="" /> : <div className="at-edit-cover-empty">+</div>}
            <button
              className="at-cover-change"
              title="Сменить обложку трека (персонально в альбоме)"
              onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
            >
              {uploading ? '⏳' : '🖼'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} style={{ display: 'none' }} />
          </div>
          <div className="at-info">
            <div className="at-title-line">
              <span className="at-title">{track.title}</span>
              {track.personalCoverUrl && <span className="at-mine" style={{ background: 'var(--green-600)' }}>обложка</span>}
            </div>
            {artistNamesStr(track, userMap) && <div className="at-artists">{artistNamesStr(track, userMap)}</div>}
          </div>
        </div>
      )}
    </Draggable>
  );
}