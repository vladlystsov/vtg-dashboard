import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import { soundCloudEmbedSrc, youtubeVideoId, detectPlatform } from '../types/track';
import type { Track } from '../types/track';

const SC_API_URL = 'https://w.soundcloud.com/player/api.js';
const YT_API_URL = 'https://www.youtube.com/iframe_api';
const SC_NEUTRAL_URL = 'https://soundcloud.com';

const FALLBACK_COVER = `${import.meta.env.BASE_URL}logo_vtg_default.jpg`;

export interface ShippedTrackItem {
  id: string;
  title: string;
  url: string;
  platform?: 'soundcloud' | 'youtube';
  coverUrl?: string;
}

type RepeatMode = 'off' | 'all' | 'one';

interface ShippedPlayerManager {
  order: ShippedTrackItem[];
  currentId: string | null;
  playing: boolean;
  pos: number;
  dur: number;
  shuffle: boolean;
  repeat: RepeatMode;
  open: boolean;
  playTrack: (id: string) => void;
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  seekTo: (ms: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setOrder: (items: ShippedTrackItem[]) => void;
  toggleOpen: () => void;
}

const ShippedPlayerContext = createContext<ShippedPlayerManager | null>(null);

export function toShippedItem(track: Track): ShippedTrackItem {
  const kind = track.platformUrl ? detectPlatform(track.platformUrl) : 'other';
  const platform = kind === 'soundcloud' || kind === 'youtube' ? kind : undefined;
  return {
    id: track.id,
    title: track.title,
    url: track.platformUrl || '',
    platform,
    coverUrl: track.coverUrl,
  };
}

export function useShippedPlayerManager(): ShippedPlayerManager {
  const ctx = useContext(ShippedPlayerContext);
  if (!ctx) throw new Error('useShippedPlayerManager вне ShippedPlayer');
  return ctx;
}

function fmt(ms: number): string {
  const s = Math.floor((ms || 0) / 1000);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${ss.toString().padStart(2, '0')}`;
}

function itemKind(item: ShippedTrackItem): 'soundcloud' | 'youtube' {
  if (item.platform) return item.platform;
  return detectPlatform(item.url) === 'youtube' ? 'youtube' : 'soundcloud';
}

function shuffleRestIds(arr: string[], keepIdx: number): string[] {
  if (arr.length <= 1) return [...arr];
  const kept = arr[keepIdx] ?? arr[0];
  const rest = arr.filter((x) => x !== kept);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const out = [...rest];
  out.splice(Math.min(keepIdx, out.length), 0, kept);
  return out;
}

function ensureScApi(): Promise<void> {
  const g = window as any;
  if (g.SC?.Widget) return Promise.resolve();
  if (!g.__vtgScApiPromise) {
    g.__vtgScApiPromise = new Promise<void>((resolve) => {
      const s = document.createElement('script');
      s.src = SC_API_URL;
      s.async = true;
      s.onload = () => resolve();
      document.body.appendChild(s);
    });
  }
  return g.__vtgScApiPromise;
}

let ytApiCallback: (() => void) | null = null;

function ensureYtApi(cb: () => void): void {
  const g = window as any;
  if (g.YT?.Player) {
    try {
      cb();
    } catch {
      /* ignore */
    }
    return;
  }
  ytApiCallback = cb;
  g.onYouTubeIframeAPIReady = () => {
    try {
      ytApiCallback?.();
    } catch {
      /* ignore */
    }
  };
  if (g.__vtgYtScriptLoading) return;
  g.__vtgYtScriptLoading = true;
  const s = document.createElement('script');
  s.src = YT_API_URL;
  s.async = true;
  document.body.appendChild(s);
}

export default function ShippedPlayer({ tracks, children }: { tracks: ShippedTrackItem[]; children?: React.ReactNode }) {
  const scIframeRef = useRef<HTMLIFrameElement | null>(null);
  const scWidgetRef = useRef<any>(null);
  const scReadyRef = useRef(false);
  const scBoundRef = useRef(false);
  const ytContainerRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const ytReadyRef = useRef(false);
  const pendingYtIdRef = useRef<string | null>(null);
  const ytTimerRef = useRef<number | null>(null);
  const activeEngineRef = useRef<'sc' | 'yt'>('sc');
  const lookupRef = useRef<Map<string, ShippedTrackItem>>(new Map());

  const [order, setOrder] = useState<ShippedTrackItem[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('off');
  const [open, setOpen] = useState(false);

  const orderRef = useRef(order);
  const currentIdRef = useRef(currentId);
  const repeatRef = useRef(repeat);
  orderRef.current = order;
  currentIdRef.current = currentId;
  repeatRef.current = repeat;
  lookupRef.current = new Map(tracks.map((t) => [t.id, t]));

  // sync order with incoming list
  useEffect(() => {
    const ids = tracks.map((t) => t.id);
    const idSet = new Set(ids);
    const keep = orderRef.current.filter((x) => idSet.has(x.id));
    const added = tracks.filter((t) => !keep.some((x) => x.id === t.id));
    setOrder([...keep, ...added]);
    const cur = currentIdRef.current;
    if (cur && !idSet.has(cur)) {
      setCurrentId(null);
      setPlaying(false);
      setPos(0);
      setDur(0);
    }
  }, [tracks]);

  const stopYtTimer = useCallback(() => {
    if (ytTimerRef.current != null) {
      window.clearInterval(ytTimerRef.current);
      ytTimerRef.current = null;
    }
  }, []);

  const pauseSc = useCallback(() => {
    const w = scWidgetRef.current;
    if (w && scReadyRef.current) {
      try {
        w.pause();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const pauseYt = useCallback(() => {
    stopYtTimer();
    const p = ytPlayerRef.current;
    if (p && ytReadyRef.current) {
      try {
        p.pauseVideo();
      } catch {
        /* ignore */
      }
    }
  }, [stopYtTimer]);

  const playTrack = useCallback(
    (id: string) => {
      const item = lookupRef.current.get(id);
      if (!item || !item.url || !item.url.trim()) return;
      currentIdRef.current = id;
      setCurrentId(id);
      setPos(0);
      setDur(0);
      setPlaying(true);
      const isYt = itemKind(item) === 'youtube';
      activeEngineRef.current = isYt ? 'yt' : 'sc';
      if (isYt) pauseSc();
      else pauseYt();
      if (isYt) {
        const vid = youtubeVideoId(item.url);
        if (!vid) {
          setPlaying(false);
          return;
        }
        const p = ytPlayerRef.current;
        if (p && ytReadyRef.current) {
          p.loadVideoById(vid);
          try {
            const d = p.getDuration();
            if (d) setDur(Math.round(d * 1000));
          } catch {
            /* ignore */
          }
        } else {
          pendingYtIdRef.current = vid;
        }
      } else {
        const w = scWidgetRef.current;
        if (w && scReadyRef.current) {
          w.load(item.url.trim(), { auto_play: true });
          w.getDuration((d: number) => setDur(d || 0));
        } else if (scIframeRef.current) {
          scIframeRef.current.src = soundCloudEmbedSrc(item.url.trim());
        }
      }
    },
    [pauseSc, pauseYt]
  );

  const playTrackRef = useRef(playTrack);
  playTrackRef.current = playTrack;

  const nextIndex = useCallback((from: number, wrap: boolean): number => {
    const len = orderRef.current.length;
    if (len === 0) return -1;
    const i = from + 1;
    if (i >= len) return wrap ? 0 : -1;
    return i;
  }, []);

  const handleFinishRef = useRef<() => void>(() => {});
  handleFinishRef.current = useCallback(() => {
    if (repeatRef.current === 'one') {
      const cur = currentIdRef.current;
      if (cur) playTrackRef.current(cur);
      return;
    }
    const from = orderRef.current.findIndex((x) => x.id === currentIdRef.current);
    if (from < 0) return;
    const nextIdx = nextIndex(from, repeatRef.current === 'all');
    if (nextIdx < 0) {
      setPlaying(false);
      return;
    }
    playTrackRef.current(orderRef.current[nextIdx].id);
  }, [nextIndex]);

  const startYtTimer = useCallback(() => {
    stopYtTimer();
    ytTimerRef.current = window.setInterval(() => {
      const p = ytPlayerRef.current;
      if (!p || activeEngineRef.current !== 'yt') return;
      try {
        const t = p.getCurrentTime();
        if (typeof t === 'number') setPos(Math.max(0, Math.round(t * 1000)));
        const d = p.getDuration();
        if (d) setDur(Math.round(d * 1000));
      } catch {
        /* ignore */
      }
    }, 500);
  }, [stopYtTimer]);

  const initEngines = useCallback(() => {
    const createScIframe = () => {
      if (scIframeRef.current) return scIframeRef.current;
      const f = document.createElement('iframe');
      f.title = 'SoundCloud Player';
      f.allow = 'autoplay';
      f.setAttribute('scrolling', 'no');
      f.style.cssText = 'position:fixed;left:-9999px;top:0;width:320px;height:166px;pointer-events:none;opacity:0.01;';
      f.src = soundCloudEmbedSrc(SC_NEUTRAL_URL);
      document.body.appendChild(f);
      scIframeRef.current = f;
      return f;
    };

    ensureScApi().then(() => {
      try {
        const f = createScIframe();
        const first = orderRef.current[0];
        if (first && first.url && first.url.trim()) {
          f.src = soundCloudEmbedSrc(first.url.trim());
        }
        if (!scBoundRef.current) {
          scBoundRef.current = true;
          const w = (window as any).SC.Widget(f);
          scWidgetRef.current = w;
          w.bind((window as any).SC.Widget.Events.READY, () => {
            scReadyRef.current = true;
            w.bind((window as any).SC.Widget.Events.PLAY_PROGRESS, (d: any) => {
              if (activeEngineRef.current !== 'sc') return;
              setPos(d.currentPosition || 0);
            });
            w.bind((window as any).SC.Widget.Events.FINISH, () => {
              if (activeEngineRef.current === 'sc') handleFinishRef.current();
            });
            w.bind((window as any).SC.Widget.Events.PLAY, () => {
              if (activeEngineRef.current === 'sc') setPlaying(true);
            });
            w.bind((window as any).SC.Widget.Events.PAUSE, () => {
              if (activeEngineRef.current === 'sc') setPlaying(false);
            });
            const target = currentIdRef.current;
            if (target) playTrackRef.current(target);
          });
        }
      } catch (e) {
        console.error('SoundCloud engine init failed', e);
      }
    });

    const createYtPlayer = () => {
      if (ytPlayerRef.current || !(window as any).YT?.Player) return;
      try {
        if (!ytContainerRef.current) {
          const d = document.createElement('div');
          d.style.cssText = 'position:fixed;left:-9999px;top:0;width:240px;height:135px;opacity:0.01;pointer-events:none;';
          d.innerHTML = '<div id="vtg-yt-player-host"></div>';
          document.body.appendChild(d);
          ytContainerRef.current = d;
        }
        const firstYt = orderRef.current.find((x) => itemKind(x) === 'youtube');
        const firstId = firstYt ? youtubeVideoId(firstYt.url) : undefined;
        ytPlayerRef.current = new (window as any).YT.Player('vtg-yt-player-host', {
          width: 240,
          height: 135,
          videoId: firstId || undefined,
          playerVars: { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1 },
          events: {
            onReady: () => {
              ytReadyRef.current = true;
              const pid = pendingYtIdRef.current;
              pendingYtIdRef.current = null;
              if (pid) ytPlayerRef.current.loadVideoById(pid);
              const cur = currentIdRef.current;
              const item = cur ? lookupRef.current.get(cur) : null;
              if (item && itemKind(item) === 'youtube') {
                try {
                  const d = ytPlayerRef.current.getDuration();
                  if (d) setDur(Math.round(d * 1000));
                } catch {
                  /* ignore */
                }
              }
            },
            onStateChange: (s: any) => {
              if (activeEngineRef.current !== 'yt') return;
              const code = s.data;
              if (code === 1) {
                setPlaying(true);
                startYtTimer();
              } else if (code === 2) {
                setPlaying(false);
                stopYtTimer();
              } else if (code === 0) {
                setPlaying(false);
                stopYtTimer();
                handleFinishRef.current();
              }
            },
          },
        });
      } catch (e) {
        console.error('YouTube engine init failed', e);
      }
    };

    ensureYtApi(createYtPlayer);
  }, [startYtTimer, stopYtTimer]);

  useEffect(() => {
    initEngines();
    return () => {
      stopYtTimer();
      scIframeRef.current?.remove();
      scIframeRef.current = null;
      scWidgetRef.current = null;
      scReadyRef.current = false;
      scBoundRef.current = false;
      ytContainerRef.current?.remove();
      ytContainerRef.current = null;
      ytPlayerRef.current = null;
      ytReadyRef.current = false;
      pendingYtIdRef.current = null;
    };
  }, [initEngines, stopYtTimer]);

  const togglePlay = useCallback(() => {
    const target = currentIdRef.current || orderRef.current[0]?.id;
    if (!target) return;
    const item = lookupRef.current.get(target);
    if (!item || !item.url || !item.url.trim()) return;
    if (itemKind(item) === 'youtube') {
      const p = ytPlayerRef.current;
      if (!p || !ytReadyRef.current) {
        playTrackRef.current(target);
        return;
      }
      try {
        const st = p.getPlayerState();
        if (st === 1) p.pauseVideo();
        else p.playVideo();
      } catch {
        playTrackRef.current(target);
      }
    } else {
      const w = scWidgetRef.current;
      if (!w || !scReadyRef.current) {
        playTrackRef.current(target);
        return;
      }
      w.toggle();
    }
  }, []);

  const next = useCallback(() => {
    const from = orderRef.current.findIndex((x) => x.id === currentIdRef.current);
    if (orderRef.current.length === 0) return;
    const base = from >= 0 ? from : -1;
    const idx = nextIndex(base, repeatRef.current !== 'off');
    if (idx < 0) {
      setPlaying(false);
      return;
    }
    playTrackRef.current(orderRef.current[idx].id);
  }, [nextIndex]);

  const prev = useCallback(() => {
    if (orderRef.current.length === 0) return;
    const from = orderRef.current.findIndex((x) => x.id === currentIdRef.current);
    let i = from - 1;
    if (i < 0) i = orderRef.current.length - 1;
    playTrackRef.current(orderRef.current[i].id);
  }, []);

  const seekTo = useCallback((ms: number) => {
    const cur = currentIdRef.current;
    if (!cur) return;
    const item = lookupRef.current.get(cur);
    if (!item) return;
    if (itemKind(item) === 'youtube') {
      const p = ytPlayerRef.current;
      if (p && ytReadyRef.current) {
        try {
          p.seekTo(ms / 1000, true);
        } catch {
          /* ignore */
        }
      }
    } else {
      const w = scWidgetRef.current;
      if (w && scReadyRef.current) w.seekTo(ms);
    }
  }, []);

  const toggleShuffle = useCallback(() => {
    setShuffle((v) => {
      const nextV = !v;
      if (nextV) {
        setOrder((o) => {
          const idx = Math.max(0, orderRef.current.findIndex((x) => x.id === currentIdRef.current));
          const newIds = shuffleRestIds(o.map((x) => x.id), idx);
          const byId = new Map(o.map((x) => [x.id, x]));
          return newIds.map((id) => byId.get(id)!).filter(Boolean);
        });
      } else {
        setOrder((o) => {
          const curId = currentIdRef.current;
          const ids = tracks.map((t) => t.id);
          if (!curId || ids.length === 0) return o;
          const keepIdx = Math.max(0, orderRef.current.findIndex((x) => x.id === curId));
          const rest = ids.filter((id) => id !== curId);
          const out = [...rest];
          out.splice(Math.min(keepIdx, out.length), 0, curId);
          const byId = new Map(o.map((x) => [x.id, x]));
          return out.map((id) => byId.get(id)).filter((x): x is ShippedTrackItem => !!x);
        });
      }
      return nextV;
    });
  }, [tracks]);

  const cycleRepeat = useCallback(() => {
    setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off'));
  }, []);

  const toggleOpen = useCallback(() => setOpen((v) => !v), []);

  const handleRowDrag = useCallback((result: DropResult) => {
    const { destination, source } = result;
    if (!destination) return;
    if (destination.index === source.index) return;
    setOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(source.index, 1);
      next.splice(destination.index, 0, moved);
      return next;
    });
  }, []);

  const manager: ShippedPlayerManager = useMemo(
    () => ({
      order,
      currentId,
      playing,
      pos,
      dur,
      shuffle,
      repeat,
      open,
      playTrack,
      togglePlay,
      next,
      prev,
      seekTo,
      toggleShuffle,
      cycleRepeat,
      setOrder,
      toggleOpen,
    }),
    [order, currentId, playing, pos, dur, shuffle, repeat, open, playTrack, togglePlay, next, prev, seekTo, toggleShuffle, cycleRepeat, toggleOpen]
  );

  const current = order.find((x) => x.id === currentId);

  return (
    <ShippedPlayerContext.Provider value={manager}>
      {order.length > 0 && (
        <>
          <div className="shipped-player" onClick={(e) => e.stopPropagation()}>
            <div className="sp-controls">
              <button
                type="button"
                className={`sp-btn ${shuffle ? 'sp-active' : ''}`}
                onClick={toggleShuffle}
                title={shuffle ? 'Перемешать: вкл' : 'Перемешать'}
              >
                ⇄
              </button>
              <button type="button" className="sp-btn" onClick={prev} title="Предыдущий">‹‹</button>
              <button type="button" className="sp-btn sp-play" onClick={togglePlay} title={playing ? 'Пауза' : 'Играть'}>
                {playing ? '⏸' : '▶'}
              </button>
              <button type="button" className="sp-btn" onClick={next} title="Следующий">››</button>
              <button
                type="button"
                className={`sp-btn ${repeat !== 'off' ? 'sp-active' : ''}`}
                onClick={cycleRepeat}
                title={repeat === 'one' ? 'Повтор одной' : repeat === 'all' ? 'Повторить всё' : 'Повтор'}
              >
                {repeat === 'one' ? '↻1' : '↻'}
              </button>
            </div>
            <div className="sp-main">
              <div className="sp-info">
                {current && <img className="sp-cover" src={current.coverUrl?.trim() || FALLBACK_COVER} alt="" />}
                <span className="sp-title">{current ? current.title : '—'}</span>
                {current && (
                  <a className="sp-open" href={current.url} target="_blank" rel="noopener noreferrer" title="Открыть на платформе">↗</a>
                )}
              </div>
              <div className="sp-timeline">
                <span className="sp-time">{fmt(pos)}</span>
                <input
                  className="sp-range"
                  type="range"
                  min={0}
                  max={Math.max(dur, 1)}
                  value={Math.min(pos, Math.max(dur, 1))}
                  onChange={(e) => seekTo(Number(e.target.value))}
                />
                <span className="sp-time">{fmt(dur)}</span>
              </div>
            </div>
            <button
              type="button"
              className={`sp-btn sp-list-toggle ${open ? 'sp-active' : ''}`}
              onClick={toggleOpen}
              title="Треклист"
            >
              {open ? '▼' : '☰'}
            </button>
          </div>
          {open && (
            <div className="sp-drawer">
              <DragDropContext onDragEnd={handleRowDrag}>
                <Droppable droppableId="sp-tracklist">
                  {(provided) => (
                    <div className="sp-list" ref={provided.innerRef} {...provided.droppableProps}>
                      {order.map((item, idx) => (
                        <Draggable key={item.id} draggableId={item.id} index={idx}>
                          {(p) => (
                            <div
                              className={`sp-row ${item.id === currentId ? 'sp-row-current' : ''}`}
                              ref={p.innerRef}
                              {...p.draggableProps}
                              onClick={() => {
                                playTrack(item.id);
                              }}
                            >
                              <span className="sp-grip" {...p.dragHandleProps}>⠿</span>
                              <span className="sp-row-num">{idx + 1}</span>
                              <img className="sp-row-cover" src={item.coverUrl?.trim() || FALLBACK_COVER} alt="" />
                              <span className="sp-row-title">{item.title}</span>
                              {item.id === currentId && <span className="sp-row-state">{playing ? '▶' : '⏸'}</span>}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            </div>
          )}
        </>
      )}
      {children}
    </ShippedPlayerContext.Provider>
  );
}

export function ShippedMini({ item }: { item: ShippedTrackItem }) {
  const m = useShippedPlayerManager();
  const isCurrent = m.currentId === item.id;
  const pos = isCurrent ? m.pos : 0;
  const maxDur = Math.max(isCurrent ? m.dur : 0, 1);
  const value = Math.min(pos, maxDur);

  return (
    <div className="shipped-mini" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={`sp-btn sp-mini-play ${isCurrent && m.playing ? 'sp-playing' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          if (isCurrent) m.togglePlay();
          else m.playTrack(item.id);
        }}
        title={isCurrent && m.playing ? 'Пауза' : 'Играть'}
      >
        {isCurrent && m.playing ? '⏸' : '▶'}
      </button>
      <input
        className="sp-range"
        type="range"
        min={0}
        max={maxDur}
        value={value}
        disabled={!isCurrent}
        onChange={(e) => m.seekTo(Number(e.target.value))}
      />
      <span className="sp-time">{fmt(pos)}</span>
      <span className="sp-time">{fmt(isCurrent ? m.dur : 0)}</span>
    </div>
  );
}