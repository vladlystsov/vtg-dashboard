import { useCallback, useEffect, useRef, useState } from 'react';
import { soundCloudEmbedSrc } from '../types/track';

export interface ShippedTrackItem {
  id: string;
  title: string;
  url: string;
}

interface ShippedPlayerProps {
  tracks: ShippedTrackItem[];
}

type RepeatMode = 'off' | 'all' | 'one';

declare global {
  interface Window {
    SC?: any;
  }
}

function shuffleRest(arr: string[], keepIdx: number): string[] {
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

export default function ShippedPlayer({ tracks }: ShippedPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const widgetRef = useRef<any>(null);
  const readyRef = useRef(false);
  const initialSrcRef = useRef(false);
  const lookupRef = useRef<Map<string, ShippedTrackItem>>(new Map());

  const [order, setOrder] = useState<string[]>([]);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('off');

  const orderRef = useRef(order);
  const posRef = useRef(pos);
  const shuffleRef = useRef(shuffle);
  const repeatRef = useRef(repeat);

  orderRef.current = order;
  posRef.current = pos;
  shuffleRef.current = shuffle;
  repeatRef.current = repeat;
  lookupRef.current = new Map(tracks.map((t) => [t.id, t]));

  const currentId = order[pos];
  const current = lookupRef.current.get(currentId);

  const startTrack = useCallback((idx: number) => {
    const id = orderRef.current[idx];
    const t = lookupRef.current.get(id);
    if (!t || !t.url || !t.url.trim()) return;
    setPos(idx);
    setPlaying(true);
    const w = widgetRef.current;
    if (w && readyRef.current) {
      w.load(t.url.trim(), { auto_play: true });
    } else if (iframeRef.current) {
      iframeRef.current.src = soundCloudEmbedSrc(t.url.trim());
    }
  }, []);

  const pickNext = useCallback((from: number, wrap: boolean): number | null => {
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

  const handleFinish = useCallback(() => {
    if (repeatRef.current === 'one') {
      startTrack(posRef.current);
      return;
    }
    const next = pickNext(posRef.current, repeatRef.current === 'all');
    if (next === null || next < 0) {
      setPlaying(false);
      return;
    }
    startTrack(next);
  }, [pickNext, startTrack]);

  useEffect(() => {
    const ids = tracks.map((t) => t.id);
    const idSet = new Set(ids);
    const prev = orderRef.current;
    const keep = prev.filter((id) => idSet.has(id));
    const added = ids.filter((id) => !keep.includes(id));
    setOrder([...keep, ...added]);
    const cur = prev[posRef.current];
    if (cur && !idSet.has(cur)) {
      setPos(0);
      setPlaying(false);
    }
  }, [tracks]);

  useEffect(() => {
    setPos((p) => (order.length ? Math.min(p, order.length - 1) : 0));
  }, [order.length]);

  useEffect(() => {
    if (initialSrcRef.current) return;
    const first = tracks.find((t) => t.url && t.url.trim());
    if (first && iframeRef.current) {
      iframeRef.current.src = soundCloudEmbedSrc(first.url.trim());
      initialSrcRef.current = true;
    }
  }, [tracks]);

  useEffect(() => {
    const connect = () => {
      if (!iframeRef.current || !(window as any).SC) return;
      const w = (window as any).SC.Widget(iframeRef.current);
      widgetRef.current = w;
      w.bind((window as any).SC.Widget.Events.READY, () => {
        readyRef.current = true;
        w.bind((window as any).SC.Widget.Events.FINISH, handleFinish);
        w.bind((window as any).SC.Widget.Events.PLAY, () => setPlaying(true));
        w.bind((window as any).SC.Widget.Events.PAUSE, () => setPlaying(false));
        if (orderRef.current.length > 0) {
          startTrack(0);
        }
      });
    };
    if (!(window as any).SC) {
      const s = document.createElement('script');
      s.src = 'https://w.soundcloud.com/player/api.js';
      s.async = true;
      s.onload = connect;
      document.body.appendChild(s);
    } else {
      connect();
    }
  }, [handleFinish, startTrack]);

  const togglePlay = useCallback(() => {
    const w = widgetRef.current;
    if (!w || !readyRef.current) {
      if (orderRef.current.length > 0) startTrack(0);
      return;
    }
    w.toggle();
  }, [startTrack]);

  const next = useCallback(() => {
    const n = pickNext(posRef.current, repeatRef.current !== 'off');
    if (n === null || n < 0) {
      setPlaying(false);
      return;
    }
    startTrack(n);
  }, [pickNext, startTrack]);

  const prev = useCallback(() => {
    const len = orderRef.current.length;
    if (len === 0) return;
    let i = posRef.current - 1;
    if (i < 0) i = len - 1;
    startTrack(i);
  }, [startTrack]);

  const toggleShuffle = useCallback(() => {
    setShuffle((prevShuffle) => {
      const next = !prevShuffle;
      if (next) {
        setOrder((o) => shuffleRest(o, Math.min(posRef.current, o.length - 1)));
      } else {
        const curId = orderRef.current[posRef.current];
        const base = tracks.map((t) => t.id);
        if (curId && base.length) {
          const out = base.filter((x) => x !== curId);
          out.splice(Math.min(posRef.current, out.length), 0, curId);
          setOrder(out);
        }
      }
      return next;
    });
  }, [tracks]);

  const cycleRepeat = useCallback(() => {
    setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off'));
  }, []);

  if (tracks.length === 0) return null;

  return (
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
        <button
          type="button"
          className="sp-btn sp-play"
          onClick={togglePlay}
          title={playing ? 'Пауза' : 'Играть'}
        >
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
      <div className="sp-track">
        {current ? (
          <>
            <span className="sp-title">{current.title}</span>
            <a
              className="sp-open"
              href={current.url}
              target="_blank"
              rel="noopener noreferrer"
              title="Открыть на SoundCloud"
            >
              ↗
            </a>
          </>
        ) : (
          <span className="sp-empty">Выберите трек</span>
        )}
      </div>
      <iframe
        ref={iframeRef}
        className="sp-frame"
        title="SoundCloud Player"
        width="100%"
        height="166"
        frameBorder="0"
        allow="autoplay"
        scrolling="no"
      />
    </div>
  );
}