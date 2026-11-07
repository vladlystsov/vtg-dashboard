import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import { soundCloudEmbedSrc, youtubeVideoId, detectPlatform } from '../types/track';
import type { Track } from '../types/track';
import { cacheAudio, getCachedAudio, onAudioCacheChange, peekCachedAudio } from '../services/audioCacheService';

const SC_API_URL = 'https://w.soundcloud.com/player/api.js';
const YT_API_URL = 'https://www.youtube.com/iframe_api';
const SC_NEUTRAL_URL = 'https://soundcloud.com';

const FALLBACK_COVER = `${import.meta.env.BASE_URL}logo_vtg_default.jpg`;

export interface ShippedTrackItem {
  id: string;
  title: string;
  url: string;
  platform?: 'soundcloud' | 'youtube' | 'audio';
  coverUrl?: string;
  // РћС‚РіСЂСѓР¶РµРЅРЅС‹Р№ (Р·Р°РІРµСЂС€С‘РЅРЅС‹Р№) С‚СЂРµРє вЂ” РґР»СЏ С„РёР»СЊС‚СЂР° В«С‚РѕР»СЊРєРѕ РѕС‚РіСЂСѓР¶РµРЅРЅРѕРµВ»
  shipped?: boolean;
  // РСЃС‚РѕС‡РЅРёРє: С‚СЂРµРє РёР»Рё Р±РёС‚
  source?: 'track' | 'beat';
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
  allOn: boolean;
  open: boolean;
  playTrack: (id: string) => void;
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  seekTo: (ms: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setScope: (items: ShippedTrackItem[]) => void;
  toggleAll: () => void;
  setOrder: (items: ShippedTrackItem[]) => void;
  toggleOpen: () => void;
}

const ShippedPlayerContext = createContext<ShippedPlayerManager | null>(null);

export function shippedFromUrl(
  id: string,
  title: string,
  url: string,
  coverUrl?: string,
  shipped?: boolean,
  source?: 'track' | 'beat'
): ShippedTrackItem {
  const kind = detectPlatform(url);
  const platform =
    kind === 'soundcloud' || kind === 'youtube' || kind === 'audio' ? kind : undefined;
  return { id, title, url, platform, coverUrl, shipped, source };
}

export function toShippedItem(track: Track): ShippedTrackItem {
  return shippedFromUrl(
    track.id,
    track.title,
    track.platformUrl || '',
    track.coverUrl || track.personalCoverUrl,
    track.status === 'completed',
    'track'
  );
}

export function useShippedPlayerManager(): ShippedPlayerManager {
  const ctx = useContext(ShippedPlayerContext);
  if (!ctx) throw new Error('useShippedPlayerManager РІРЅРµ ShippedPlayer');
  return ctx;
}

function fmt(ms: number): string {
  const s = Math.floor((ms || 0) / 1000);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${ss.toString().padStart(2, '0')}`;
}

function itemKind(item: ShippedTrackItem): 'soundcloud' | 'youtube' | 'audio' {
  if (item.platform) return item.platform;
  const k = detectPlatform(item.url);
  return k === 'youtube' ? 'youtube' : k === 'audio' ? 'audio' : 'soundcloud';
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeEngineRef = useRef<'sc' | 'yt' | 'audio'>('sc');
  // Р¤Р»Р°РіРё "СЌС‚РѕС‚ РґРІРёР¶РѕРє СЃРµР№С‡Р°СЃ РЅСѓР¶РµРЅ, С‡С‚РѕР±С‹ Р·РІСѓС‡Р°Р»". РќСѓР¶РЅС‹, С‡С‚РѕР±С‹ РѕС‚РјРµРЅСЏС‚СЊ
  // РѕС‚Р»РѕР¶РµРЅРЅРѕРµ Р°РІС‚РѕРІРѕСЃРїСЂРѕРёР·РІРµРґРµРЅРёРµ РґСЂСѓРіРѕРіРѕ РґРІРёР¶РєР° РїСЂРё Р±С‹СЃС‚СЂРѕРј РїРµСЂРµРєР»СЋС‡РµРЅРёРё
  // (РЅР°РїСЂРёРјРµСЂ: РЅР°Р¶Р°Р»Рё СЃР°Р№С‚РѕРІС‹Р№ С‚СЂРµРє Рё, РЅРµ РґРѕР¶РёРґР°СЏСЃСЊ РїСЂРѕРіСЂСѓР·РєРё, СѓС€Р»Рё РЅР° Р»РѕРєР°Р»СЊРЅС‹Р№ вЂ”
  // СЃР°Р№С‚РѕРІС‹Р№ РїР»РµРµСЂ РЅРµ РґРѕР»Р¶РµРЅ РЅР°С‡Р°С‚СЊ РёРіСЂР°С‚СЊ РїРѕСЃР»Рµ С‚РѕРіРѕ, РєР°Рє Р·Р°РёРіСЂР°Р» Р»РѕРєР°Р»СЊРЅС‹Р№).
  const scWantedRef = useRef(false);
  const ytWantedRef = useRef(false);
  const lookupRef = useRef<Map<string, ShippedTrackItem>>(new Map());
  const objectUrlRef = useRef<Map<string, string>>(new Map());
  // Р—Р°С‰РёС‚Р° РѕС‚ С†РёРєР»Р°: РµСЃР»Рё Рё Р±Р»РѕР± РёР· РєСЌС€Р° РЅРµ Р·Р°РёРіСЂР°Р», РїРѕРІС‚РѕСЂРЅРѕ РЅР° РѕС€РёР±РєСѓ
  // РЅРµ РїРµСЂРµРєР»СЋС‡Р°РµРјСЃСЏ.
  const audioBlobFallbackRef = useRef(false);

  const [order, setOrder] = useState<ShippedTrackItem[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('off');
  // allOn: (All) вЂ” РёРіСЂР°С‚СЊ РёР· РІСЃРµРіРѕ СЃРїРёСЃРєР° СЃР°Р№С‚Р°. Р’С‹РєР»СЋС‡РµРЅРѕ вЂ” С‚РѕР»СЊРєРѕ РёР· С‚РµРєСѓС‰РµРіРѕ СЂР°Р·РґРµР»Р°.
  const [allOn, setAllOn] = useState(false);
  const [scope, setScope] = useState<ShippedTrackItem[] | null>(null);
  const [open, setOpen] = useState(false);

  const orderRef = useRef(order);
  const currentIdRef = useRef(currentId);
  const repeatRef = useRef(repeat);
  const allOnRef = useRef(allOn);
  const scopeRef = useRef(scope);
  orderRef.current = order;
  currentIdRef.current = currentId;
  repeatRef.current = repeat;
  allOnRef.current = allOn;
  scopeRef.current = scope;
  lookupRef.current = new Map(tracks.map((t) => [t.id, t]));

  // РўСЂРµРєР»РёСЃС‚ РќР• РїРµСЂРµСЃРѕР±РёСЂР°РµС‚СЃСЏ РѕС‚ СЃРјРµРЅС‹ СЂР°Р·РґРµР»РѕРІ/С„РёР»СЊС‚СЂРѕРІ: РїСЂРё РїРµСЂРµС…РѕРґРµ РјРµР¶РґСѓ
  // СЂР°Р·РґРµР»Р°РјРё С‚РµРєСѓС‰Р°СЏ РѕС‡РµСЂРµРґСЊ РїСЂРѕРёРіСЂС‹РІР°РЅРёСЏ РѕСЃС‚Р°С‘С‚СЃСЏ РїСЂРµР¶РЅРµР№. РџРѕР»РЅС‹Р№ СЃРїРёСЃРѕРє
  // РґРѕР±Р°РІР»СЏРµС‚СЃСЏ С‚РѕР»СЊРєРѕ РєРЅРѕРїРєРѕР№ (All), Р° РїРµСЂРµСЃР±РѕСЂРєР° РїРѕРґ В«РІС‹СЃС‚Р°РІР»РµРЅРЅС‹Р№ С„РёР»СЊС‚СЂВ»
  // РїСЂРѕРёСЃС…РѕРґРёС‚ РІ РјРѕРјРµРЅС‚, РєРѕРіРґР° РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ РІС‹Р±РёСЂР°РµС‚ РІ РЅС‘Рј РЅРѕРІС‹Р№ С‚СЂРµРє (playTrack).
  useEffect(() => {
    // Р’ РѕС‡РµСЂРµРґСЊ РїРѕРїР°РґР°СЋС‚ С‚РѕР»СЊРєРѕ РѕС‚РіСЂСѓР¶РµРЅРЅС‹Рµ (shipped) вЂ” РЅРµРѕС‚РіСЂСѓР¶РµРЅРЅС‹Рµ
    // РєР°СЂС‚РѕС‡РєРё РІ РїР»РµР№Р»РёСЃС‚ РЅРµ РѕС‚РѕР±СЂР°Р¶Р°СЋС‚СЃСЏ (РІ С‚.С‡. РІ СЂРµР¶РёРјРµ (All)).
    const base = (allOnRef.current ? tracks : scopeRef.current ?? tracks)
      .filter((t) => t.shipped !== false);
    setOrder((prev) => {
      const ids = new Set(base.map((t) => t.id));
      const keep = prev.filter((x) => ids.has(x.id));
      const added = base.filter((t) => !keep.some((x) => x.id === t.id));
      return [...keep, ...added];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allOn, tracks]);

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

  const pauseAudio = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      try {
        a.pause();
      } catch {
        /* ignore */
      }
    }
  }, []);

  /**
   * Р—Р°РїСѓСЃРє Р»РѕРєР°Р»СЊРЅРѕРіРѕ mp3/Р°СѓРґРёРѕС„Р°Р№Р»Р°.
   *
   * Р’Р°Р¶РЅРѕ: play() РІС‹Р·С‹РІР°РµС‚СЃСЏ РЎРРќРҐР РћРќРќРћ РІ РѕР±СЂР°Р±РѕС‚С‡РёРєРµ РєР»РёРєР°. Р Р°РЅСЊС€Рµ РїРµСЂРµРґ РЅРёРј
   * Р¶РґР°Р»Рё getCachedAudio() (IndexedDB), РёР·-Р·Р° С‡РµРіРѕ Р±СЂР°СѓР·РµСЂ С‚РµСЂСЏР» РїРѕР»СЊР·РѕРІР°С‚РµР»СЊСЃРєРёР№
   * Р¶РµСЃС‚ Рё РЅРѕРІС‹Р№ С‚СЂРµРє (РµРіРѕ РµС‰С‘ РЅРµС‚ РІ РєСЌС€Рµ) РјРѕР»С‡Р° РЅРµ Р·Р°РїСѓСЃРєР°Р»СЃСЏ РЅР° СЃР°Р№С‚Рµ.
   * Р’ Android WebView РѕРіСЂР°РЅРёС‡РµРЅРёРµ РјСЏРіС‡Рµ, РїРѕСЌС‚РѕРјСѓ С‚Р°Рј РІСЃС‘ СЂР°Р±РѕС‚Р°Р»Рѕ.
   * РР· РєСЌС€Р° Р±РµСЂС‘Рј С‚РѕР»СЊРєРѕ В«РіРѕСЂСЏС‡РёР№В» Р±Р»РѕР±; РµСЃР»Рё РµРіРѕ РЅРµС‚ вЂ” СЃСЂР°Р·Сѓ РёРіСЂР°РµРј РїРѕ СЃРµС‚Рё,
   * Р° РєСЌС€РёСЂРѕРІР°РЅРёРµ Рё РѕС„Р»Р°Р№РЅ-РїРѕРґРјРµРЅСѓ РґРµР»Р°РµРј РІ С„РѕРЅРµ.
   */
  const startAudio = useCallback((item: ShippedTrackItem) => {
    const a = audioRef.current;
    if (!a) return;
    audioBlobFallbackRef.current = false;
    try {
      a.pause();
      a.removeAttribute('src');
      a.load();
    } catch {
      /* ignore */
    }
    const prev = objectUrlRef.current.get(item.id);
    if (prev) {
      URL.revokeObjectURL(prev);
      objectUrlRef.current.delete(item.id);
    }
    const hot = peekCachedAudio(item.id);
    if (hot) {
      const objUrl = URL.createObjectURL(hot);
      objectUrlRef.current.set(item.id, objUrl);
      a.src = objUrl;
    } else {
      a.src = item.url.trim();
    }
    const p = a.play();
    if (p && typeof p.catch === 'function') p.catch(() => { /* ignore */ });
    if (hot) return;

    // РќРѕРІС‹Р№ С‚СЂРµРє РµС‰С‘ РЅРµ РІ РєСЌС€Рµ: РєР°С‡Р°РµРј РІ С„РѕРЅ Рё, РµСЃР»Рё СЃРµС‚СЊ РЅРµ РґР°Р»Р° СЃС‚Р°СЂС‚
    // (РѕС„Р»Р°Р№РЅ/Р±РёС‚Р°СЏ СЃСЃС‹Р»РєР°), РїСЂРѕР±СѓРµРј Р·Р°РёРіСЂР°С‚СЊ РёР· СѓР¶Рµ СЃРѕС…СЂР°РЅС‘РЅРЅРѕРіРѕ Р±Р»РѕР±Р°.
    void cacheAudio({ id: item.id, url: item.url.trim(), title: item.title });
    void (async () => {
      const cached = await getCachedAudio(item.id);
      if (!cached || currentIdRef.current !== item.id) return;
      if (a.readyState > 0 || !a.paused) return;
      try {
        const objUrl = URL.createObjectURL(cached.blob);
        objectUrlRef.current.set(item.id, objUrl);
        a.src = objUrl;
        const q = a.play();
        if (q && typeof q.catch === 'function') q.catch(() => { /* ignore */ });
      } catch {
        /* ignore */
      }
    })();
  }, []);

  // РџРµСЂРµСЃР±РѕСЂРєР° РѕС‡РµСЂРµРґРё РїРѕРґ С‚РµРєСѓС‰СѓСЋ РІС‹Р±РѕСЂРєСѓ (СЂР°Р·РґРµР»/С„РёР»СЊС‚СЂ) вЂ” С‚РѕР»СЊРєРѕ РєРѕРіРґР°
  // РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ СЏРІРЅРѕ РІС‹Р±РёСЂР°РµС‚ С‚СЂРµРє. РЎРјРµРЅР° СЂР°Р·РґРµР»Р° СЃР°РјР° РїРѕ СЃРµР±Рµ РѕС‡РµСЂРµРґСЊ РЅРµ С‚СЂРѕРіР°РµС‚.
  const ensureOrder = useCallback(
    (id: string) => {
      // РўРѕР»СЊРєРѕ РѕС‚РіСЂСѓР¶РµРЅРЅС‹Рµ: РЅРµРѕС‚РіСЂСѓР¶РµРЅРЅС‹Рµ РєР°СЂС‚РѕС‡РєРё РЅРµ РїРѕРєР°Р·С‹РІР°РµРј РІ РїР»РµР№Р»РёСЃС‚Рµ
      // РґР°Р¶Рµ РїСЂРё (All) вЂ” СЏРІРЅРѕ Р·Р°РїСѓС‰РµРЅРЅС‹Р№ С‚СЂРµРє РґРѕР±Р°РІР»СЏРµС‚СЃСЏ РЅРёР¶Рµ, РµСЃР»Рё РѕРЅ РѕС‚РіСЂСѓР¶РµРЅ.
      const base = (allOnRef.current ? tracks : scopeRef.current ?? tracks)
        .filter((t) => t.shipped !== false);
      if (base.length === 0) return;
      const baseIds = new Set(base.map((t) => t.id));
      setOrder((prev) => {
        const hasTarget = prev.some((x) => x.id === id);
        const allInBase = prev.every((x) => baseIds.has(x.id));
        if (hasTarget && allInBase) return prev;
        const keep = prev.filter((x) => baseIds.has(x.id));
        const seen = new Set(keep.map((x) => x.id));
        const added = base.filter((t) => !seen.has(t.id));
        const result = [...keep, ...added];
        if (!result.some((x) => x.id === id)) {
          const item = lookupRef.current.get(id);
          if (item) result.push(item);
        }
        return result;
      });
    },
    [tracks]
  );

  const playTrack = useCallback(
    (id: string) => {
      const item = lookupRef.current.get(id);
      if (!item || !item.url || !item.url.trim()) return;
      ensureOrder(id);
      currentIdRef.current = id;
      setCurrentId(id);
      setPos(0);
      setDur(0);
      setPlaying(true);
      const isYt = itemKind(item) === 'youtube';
      const isAudio = itemKind(item) === 'audio';
      activeEngineRef.current = isYt ? 'yt' : isAudio ? 'audio' : 'sc';
      // РџРѕРјРµС‡Р°РµРј РЅСѓР¶РЅС‹Р№ РґРІРёР¶РѕРє, РѕСЃС‚Р°Р»СЊРЅС‹Рј Р·Р°РїСЂРµС‰Р°РµРј Р°РІС‚РѕРІРѕСЃРїСЂРѕРёР·РІРµРґРµРЅРёРµ,
      // РєРѕС‚РѕСЂРѕРµ РјРѕРіР»Рѕ Р±С‹С‚СЊ РѕС‚Р»РѕР¶РµРЅРѕ (С„Р°Р№Р»/РІРёРґР¶РµС‚ РµС‰С‘ РіСЂСѓР·РёС‚СЃСЏ).
      scWantedRef.current = !isAudio && !isYt;
      ytWantedRef.current = isYt;
      if (isYt) {
        pauseSc();
        pauseAudio();
      } else if (isAudio) {
        pauseSc();
        pauseYt();
      } else {
        pauseYt();
        pauseAudio();
      }
      if (currentIdRef.current !== id) return;
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
            p.playVideo();
          } catch {
            /* ignore */
          }
          try {
            const d = p.getDuration();
            if (d) setDur(Math.round(d * 1000));
          } catch {
            /* ignore */
          }
        } else {
          pendingYtIdRef.current = vid;
        }
      } else if (isAudio) {
        startAudio(item);
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
    [pauseSc, pauseYt, pauseAudio, ensureOrder, startAudio]
  );

  const playTrackRef = useRef(playTrack);
  playTrackRef.current = playTrack;

  // РµСЃР»Рё С‚РµРєСѓС‰РёР№ С‚СЂРµРє СѓРґР°Р»РёР»Рё РёР· РєСЌС€Р° (РёР»Рё РѕС‡РёСЃС‚РёР»Рё РІРµСЃСЊ РєСЌС€) вЂ”
  // РїРµСЂРµРєР»СЋС‡Р°РµРј РЅР° СЃРµС‚РµРІРѕР№ РёСЃС‚РѕС‡РЅРёРє, С‡С‚РѕР±С‹ РІРѕСЃРїСЂРѕРёР·РІРµРґРµРЅРёРµ РЅРµ РѕР±РѕСЂРІР°Р»РѕСЃСЊ
  useEffect(
    () =>
      onAudioCacheChange((affectedId?: string) => {
        const cur = currentIdRef.current;
        if (affectedId !== undefined && affectedId !== cur) return;
        if (activeEngineRef.current !== 'audio' || !cur) return;
        const item = lookupRef.current.get(cur);
        const a = audioRef.current;
        if (!item || !a) return;
        try {
          const prev = objectUrlRef.current.get(item.id);
          if (prev) {
            URL.revokeObjectURL(prev);
            objectUrlRef.current.delete(item.id);
          }
          if (affectedId === undefined) {
            objectUrlRef.current.forEach((u) => URL.revokeObjectURL(u));
            objectUrlRef.current.clear();
          }
          a.src = item.url.trim();
        } catch {
          /* ignore */
        }
      }),
    []
  );

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
              if (!scWantedRef.current) {
                // Р”РІРёР¶РѕРє РїСЂРѕРёРіСЂС‹РІР°Р», РЅРѕ РёРј Р±РѕР»СЊС€Рµ РЅРµ РїРѕР»СЊР·СѓСЋС‚СЃСЏ (РЅР°РїСЂРёРјРµСЂ, РІ РјРѕРјРµРЅС‚
                // Р·Р°РіСЂСѓР·РєРё РїРµСЂРµРєР»СЋС‡РёР»РёСЃСЊ РЅР° Р»РѕРєР°Р»СЊРЅС‹Р№ С‚СЂРµРє) вЂ” РЅРµРјРµРґР»РµРЅРЅРѕ СЃС‚Р°РІРёРј РїР°СѓР·Сѓ.
                try {
                  w.pause();
                } catch {
                  /* ignore */
                }
                return;
              }
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
          // Р”РµСЂР¶РёРј СЃРєСЂС‹С‚С‹Р№ iframe Р’РќРЈРўР Р РІСЊСЋРїРѕСЂС‚Р° (СЂР°РЅСЊС€Рµ Р±С‹Р» left:-9999px).
          // Safari/iOS Рё Firefox РѕС‚РєР°Р·С‹РІР°СЋС‚СЃСЏ Р·Р°РїСѓСЃРєР°С‚СЊ РјРµРґРёР° РёР· РїРѕР»РЅРѕСЃС‚СЊСЋ
          // РІС‹РЅРµСЃРµРЅРЅРѕРіРѕ Р·Р° СЌРєСЂР°РЅ iframe: РЅР° СЃР°Р№С‚Рµ YouTube-С‚СЂРµРє В«РјРѕР»С‡Р°Р»В», С…РѕС‚СЏ
          // РІ Android WebView РёРіСЂР°Р». z-index:-1 Рё opacity РїСЂСЏС‡СѓС‚ РµРіРѕ РІРёР·СѓР°Р»СЊРЅРѕ.
          d.style.cssText =
            'position:fixed;right:0;bottom:0;width:240px;height:135px;opacity:0.01;' +
            'pointer-events:none;z-index:-1;overflow:hidden;';
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
          playerVars: { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1, allow: 'autoplay; encrypted-media; picture-in-picture' },
          events: {
            onReady: () => {
              ytReadyRef.current = true;
              try {
                // Р‘РµР· allow="autoplay" РєСЂРѕСЃСЃ-РґРѕРјРµРЅРЅС‹Р№ iframe РЅРµ РїРѕР»СѓС‡Р°РµС‚
                // РїРѕР»СЊР·РѕРІР°С‚РµР»СЊСЃРєРёР№ Р¶РµСЃС‚ РѕС‚ РєР»РёРєР° РїРѕ РЅР°С€РµРјСѓ РїР»РµРµСЂСѓ.
                ytPlayerRef.current
                  .getIframe()
                  .setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
              } catch {
                /* ignore */
              }
              const pid = pendingYtIdRef.current;
              pendingYtIdRef.current = null;
              if (pid) {
                if (ytWantedRef.current && activeEngineRef.current === 'yt') {
                  ytPlayerRef.current.loadVideoById(pid);
                } else {
                  // РџРѕРєР° РЅРµ РЅСѓР¶РµРЅ вЂ” РїСЂРѕСЃС‚Рѕ РїРѕРґРіСЂСѓР¶Р°РµРј РїСЂРµРІСЊСЋ, РЅРµ Р·Р°РїСѓСЃРєР°РµРј Р·РІСѓРє
                  ytPlayerRef.current.cueVideoById(pid);
                }
              }
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
                if (!ytWantedRef.current) {
                  // Р’РёРґРµРѕ РЅР°С‡Р°Р»Рѕ РёРіСЂР°С‚СЊ, С…РѕС‚СЏ РёРј Р±РѕР»СЊС€Рµ РЅРµ РїРѕР»СЊР·СѓСЋС‚СЃСЏ вЂ” СЃС‚Р°РІРёРј РїР°СѓР·Сѓ.
                  try {
                    ytPlayerRef.current.pauseVideo();
                  } catch {
                    /* ignore */
                  }
                  return;
                }
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
            onError: (e: any) => {
              // 101/150 вЂ” РІР»Р°РґРµР»РµС† РІРёРґРµРѕ Р·Р°РїСЂРµС‚РёР» РІСЃС‚СЂР°РёРІР°РЅРёРµ; 100 вЂ” РІРёРґРµРѕ РЅРµС‚.
              // Р Р°РЅСЊС€Рµ РѕС€РёР±РєР° РїСЂРѕРіР»Р°С‚С‹РІР°Р»Р°СЃСЊ, Рё РєРЅРѕРїРєР° В«РРіСЂР°С‚СЊВ» РїСЂРѕСЃС‚Рѕ РЅРёС‡РµРіРѕ
              // РЅРµ РґРµР»Р°Р»Р°. Р›РѕРіРёСЂСѓРµРј, С‡С‚РѕР±С‹ РїСЂРёС‡РёРЅР° Р±С‹Р»Р° РІРёРґРЅР° РІ РєРѕРЅСЃРѕР»Рё.
              console.error('YouTube playback error', e?.data);
              if (activeEngineRef.current === 'yt') setPlaying(false);
            },
          },
        });
      } catch (e) {
        console.error('YouTube engine init failed', e);
      }
    };

    const createAudio = () => {
      if (audioRef.current) return audioRef.current;
      const a = document.createElement('audio');
      a.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0.01;pointer-events:none;';
      a.preload = 'metadata';
      a.setAttribute('playsinline', 'true');
      a.addEventListener('timeupdate', () => {
        if (activeEngineRef.current !== 'audio') return;
        setPos(Math.max(0, Math.round((a.currentTime || 0) * 1000)));
      });
      a.addEventListener('loadedmetadata', () => {
        if (activeEngineRef.current === 'audio') setDur(isFinite(a.duration) ? Math.round(a.duration * 1000) : 0);
      });
      a.addEventListener('play', () => {
        if (activeEngineRef.current === 'audio') setPlaying(true);
      });
      a.addEventListener('pause', () => {
        if (activeEngineRef.current === 'audio') setPlaying(false);
      });
      a.addEventListener('ended', () => {
        if (activeEngineRef.current === 'audio') {
          setPlaying(false);
          handleFinishRef.current();
        }
      });
      a.addEventListener('error', () => {
        // РЎРµС‚РµРІР°СЏ СЃСЃС‹Р»РєР° РЅРµ РѕС‚РєСЂС‹Р»Р°СЃСЊ (РѕС„Р»Р°Р№РЅ, CORS/СЂРµРґРёСЂРµРєС‚, Р±РёС‚С‹Р№ С„Р°Р№Р») вЂ”
        // РµСЃР»Рё СЌС‚РѕС‚ С‚СЂРµРє СѓР¶Рµ Р»РµР¶РёС‚ РІ РєСЌС€Рµ, РёРіСЂР°РµРј РёР· РЅРµРіРѕ.
        if (activeEngineRef.current !== 'audio' || audioBlobFallbackRef.current) return;
        const cur = currentIdRef.current;
        const blob = cur ? peekCachedAudio(cur) : null;
        if (!cur || !blob) return;
        audioBlobFallbackRef.current = true;
        try {
          const prev = objectUrlRef.current.get(cur);
          if (prev) URL.revokeObjectURL(prev);
          const objUrl = URL.createObjectURL(blob);
          objectUrlRef.current.set(cur, objUrl);
          a.src = objUrl;
          const p = a.play();
          if (p && typeof p.catch === 'function') p.catch(() => { /* ignore */ });
        } catch {
          /* ignore */
        }
      });
      document.body.appendChild(a);
      audioRef.current = a;
      return a;
    };

    ensureYtApi(createYtPlayer);
    createAudio();
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
      scWantedRef.current = false;
      ytWantedRef.current = false;
      audioRef.current?.remove();
      audioRef.current = null;
      objectUrlRef.current.forEach((u) => URL.revokeObjectURL(u));
      objectUrlRef.current.clear();
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
    } else if (itemKind(item) === 'audio') {
      const a = audioRef.current;
      if (!a) {
        playTrackRef.current(target);
        return;
      }
      if (a.paused) {
        const p = a.play();
        if (p && typeof p.catch === 'function') p.catch(() => { /* ignore */ });
      } else {
        a.pause();
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
    } else if (itemKind(item) === 'audio') {
      const a = audioRef.current;
      if (a) {
        try {
          a.currentTime = ms / 1000;
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
          const base = allOnRef.current ? tracks : scopeRef.current ?? tracks;
          const ids = base.map((t) => t.id);
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

  const setScopeCb = useCallback((items: ShippedTrackItem[]) => {
    setScope(items);
  }, []);

  const toggleAll = useCallback(() => {
    setAllOn((v) => !v);
  }, []);

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
      allOn,
      open,
      playTrack,
      togglePlay,
      next,
      prev,
      seekTo,
      toggleShuffle,
      cycleRepeat,
      setScope: setScopeCb,
      toggleAll,
      setOrder,
      toggleOpen,
    }),
    [order, currentId, playing, pos, dur, shuffle, repeat, allOn, open, playTrack, togglePlay, next, prev, seekTo, toggleShuffle, cycleRepeat, setScopeCb, toggleAll, toggleOpen]
  );

  const current = order.find((x) => x.id === currentId);

  return (
    <ShippedPlayerContext.Provider value={manager}>
      {order.length > 0 && (
        <div className="sp-sticky">
          <div className="shipped-player" onClick={(e) => e.stopPropagation()}>
            <div className="sp-controls">
              <button
                type="button"
                className={`sp-btn ${shuffle ? 'sp-active' : ''}`}
                onClick={toggleShuffle}
                title={shuffle ? 'РџРµСЂРµРјРµС€Р°С‚СЊ: РІРєР»' : 'РџРµСЂРµРјРµС€Р°С‚СЊ'}
              >
                в‡„
              </button>
              <button type="button" className="sp-btn" onClick={prev} title="РџСЂРµРґС‹РґСѓС‰РёР№">вЂ№вЂ№</button>
              <button type="button" className="sp-btn sp-play" onClick={togglePlay} title={playing ? 'РџР°СѓР·Р°' : 'РРіСЂР°С‚СЊ'}>
                {playing ? 'вЏё' : 'в–¶'}
              </button>
              <button type="button" className="sp-btn" onClick={next} title="РЎР»РµРґСѓСЋС‰РёР№">вЂєвЂє</button>
              <button
                type="button"
                className={`sp-btn ${repeat !== 'off' ? 'sp-active' : ''}`}
                onClick={cycleRepeat}
                title={repeat === 'one' ? 'РџРѕРІС‚РѕСЂ РѕРґРЅРѕР№' : repeat === 'all' ? 'РџРѕРІС‚РѕСЂРёС‚СЊ РІСЃС‘' : 'РџРѕРІС‚РѕСЂ'}
              >
                {repeat === 'one' ? 'в†»1' : 'в†»'}
              </button>
              <button
                type="button"
                className={`sp-btn ${allOn ? 'sp-active' : ''}`}
                onClick={toggleAll}
                title={allOn ? '(All): РёРіСЂР°С‚СЊ РёР· РІСЃРµС… С‚СЂРµРєРѕРІ СЃР°Р№С‚Р°' : '(All): СЃРµР№С‡Р°СЃ РёРіСЂР°РµС‚ С‚РѕР»СЊРєРѕ РІС‹Р±СЂР°РЅРЅС‹Р№ СЂР°Р·РґРµР»'}
              >
                (All)
              </button>
            </div>
            <div className="sp-main">
              <div className="sp-info">
                {current && <img className="sp-cover" src={current.coverUrl?.trim() || FALLBACK_COVER} alt="" />}
                <span className="sp-title">{current ? current.title : 'вЂ”'}</span>
                {current && (
                  <a className="sp-open" href={current.url} target="_blank" rel="noopener noreferrer" title="РћС‚РєСЂС‹С‚СЊ РЅР° РїР»Р°С‚С„РѕСЂРјРµ">в†—</a>
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
                  style={{ ['--fill' as any]: `${Math.min(pos, Math.max(dur, 1)) / Math.max(dur, 1) * 100}%` }}
                  onChange={(e) => seekTo(Number(e.target.value))}
                />
                <span className="sp-time">{fmt(dur)}</span>
              </div>
            </div>
            <button
              type="button"
              className={`sp-btn sp-list-toggle ${open ? 'sp-active' : ''}`}
              onClick={toggleOpen}
              title="РўСЂРµРєР»РёСЃС‚"
            >
              {open ? 'в–ј' : 'в°'}
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
                              <span className="sp-grip" {...p.dragHandleProps}>в ї</span>
                              <span className="sp-row-num">{idx + 1}</span>
                              <img className="sp-row-cover" src={item.coverUrl?.trim() || FALLBACK_COVER} alt="" />
                              <span className="sp-row-title">{item.title}</span>
                              {item.id === currentId && <span className="sp-row-state">{playing ? 'в–¶' : 'вЏё'}</span>}
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
        </div>
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
        title={isCurrent && m.playing ? 'РџР°СѓР·Р°' : 'РРіСЂР°С‚СЊ'}
      >
        {isCurrent && m.playing ? 'вЏё' : 'в–¶'}
      </button>
      <input
        className="sp-range"
        type="range"
        min={0}
        max={maxDur}
        value={value}
        disabled={!isCurrent}
        style={{ ['--fill' as any]: `${value / maxDur * 100}%` }}
        onChange={(e) => m.seekTo(Number(e.target.value))}
      />
      <span className="sp-time">{fmt(pos)}</span>
      <span className="sp-time">{fmt(isCurrent ? m.dur : 0)}</span>
    </div>
  );
}