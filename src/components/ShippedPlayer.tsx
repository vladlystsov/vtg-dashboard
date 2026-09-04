import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import { soundCloudEmbedSrc } from '../types/track';

export interface ShippedTrackItem {
  id: string;
  title: string;
  url: string;
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

export default function ShippedPlayer({ tracks, children }: { tracks: ShippedTrackItem[]; children?: React.ReactNode }) {
  const iframeEl = useRef<HTMLIFrameElement | null>(null);
  const widgetRef = useRef<any>(null);
  const readyRef = useRef(false);
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
  const shuffleRef = useRef(shuffle);
  const repeatRef = useRef(repeat);
  orderRef.current = order;
  currentIdRef.current = currentId;
  shuffleRef.current = shuffle;
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

  const playTrack = useCallback((id: string) => {
    const item = lookupRef.current.get(id);
    if (!item || !item.url || !item.url.trim()) return;
    currentIdRef.current = id;
    setCurrentId(id);
    setPos(0);
    setDur(0);
    setPlaying(true);
    const w = widgetRef.current;
    if (w && readyRef.current) {
      w.load(item.url.trim(), { auto_play: true });
      w.getDuration((d: number) => setDur(d || 0));
    } else if (iframeEl.current) {
      iframeEl.current.src = soundCloudEmbedSrc(item.url.trim());
    }
  }, []);

  const playTrackRef = useRef(playTrack);
  playTrackRef.current = playTrack;

  const pickIndex = useCallback((from: number, wrap: boolean): number | null => {
    const len = orderRef.current.length;
    if (len === 0) return null;
    if (shuffleRef.current) {
      if (len === 1) return 0;
      const opts: number[] = [];
      for (let i = 0; i < len; i++) if (i !== from) opts.push(i);
      return opts[Math.floor(Math.random() * opts.length)];
    }
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
    const nextIdx = pickIndex(from, repeatRef.current === 'all');
    if (nextIdx === null || nextIdx < 0) {
      setPlaying(false);
      return;
    }
    playTrackRef.current(orderRef.current[nextIdx].id);
  }, [pickIndex]);

  useEffect(() => {
    const ensureScript = (cb: () => void) => {
      if ((window as any).SC) { cb(); return; }
      const s = document.createElement('script');
      s.src = 'https://w.soundcloud.com/player/api.js';
      s.async = true;
      s.onload = () => cb();
      document.body.appendChild(s);
    };

    const createIframe = () => {
      if (iframeEl.current) return iframeEl.current;
      const f = document.createElement('iframe');
      f.title = 'SoundCloud Player';
      f.allow = 'autoplay';
      f.setAttribute('scrolling', 'no');
      f.style.cssText = 'position:fixed;left:-9999px;top:0;width:320px;height:166px;pointer-events:none;opacity:0.01;';
      document.body.appendChild(f);
      iframeEl.current = f;
      return f;
    };

    const connect = () => {
      const f = createIframe();
      const first = orderRef.current[0];
      if (first) f.src = soundCloudEmbedSrc(first.url);
      const w = (window as any).SC.Widget(f);
      widgetRef.current = w;
      w.bind((window as any).SC.Widget.Events.READY, () => {
        readyRef.current = true;
        w.bind((window as any).SC.Widget.Events.PLAY_PROGRESS, (d: any) => setPos(d.currentPosition || 0));
        w.bind((window as any).SC.Widget.Events.FINISH, () => handleFinishRef.current());
        w.bind((window as any).SC.Widget.Events.PLAY, () => setPlaying(true));
        w.bind((window as any).SC.Widget.Events.PAUSE, () => setPlaying(false));
        const target = currentIdRef.current || orderRef.current[0]?.id;
        if (target) playTrackRef.current(target);
      });
    };

    ensureScript(connect);
    return () => {
      iframeEl.current?.remove();
      iframeEl.current = null;
      readyRef.current = false;
      widgetRef.current = null;
    };
  }, []);

  const togglePlay = useCallback(() => {
    const w = widgetRef.current;
    if (!w || !readyRef.current) {
      const target = currentIdRef.current || orderRef.current[0]?.id;
      if (target) playTrackRef.current(target);
      return;
    }
    w.toggle();
  }, []);

  const next = useCallback(() => {
    const from = orderRef.current.findIndex((x) => x.id === currentIdRef.current);
    if (orderRef.current.length === 0) return;
    const base = from >= 0 ? from : -1;
    const idx = pickIndex(base, repeatRef.current !== 'off');
    if (idx === null || idx < 0) { setPlaying(false); return; }
    playTrackRef.current(orderRef.current[idx].id);
  }, [pickIndex]);

  const prev = useCallback(() => {
    if (orderRef.current.length === 0) return;
    const from = orderRef.current.findIndex((x) => x.id === currentIdRef.current);
    let i = from - 1;
    if (i < 0) i = orderRef.current.length - 1;
    playTrackRef.current(orderRef.current[i].id);
  }, []);

  const seekTo = useCallback((ms: number) => {
    const w = widgetRef.current;
    if (w && readyRef.current) w.seekTo(ms);
  }, []);

  const toggleShuffle = useCallback(() => {
    setShuffle((v) => {
      const next = !v;
      if (next) {
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
      return next;
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
                <span className="sp-title">{current ? current.title : '—'}</span>
                {current && (
                  <a className="sp-open" href={current.url} target="_blank" rel="noopener noreferrer" title="Открыть на SoundCloud">↗</a>
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