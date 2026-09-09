import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Track, Project } from '../types/track';
import type { Beat } from '../types/beat';
import {
  deleteStorageFile,
  listStorageFiles,
  storagePathFromUrl,
  type StorageItem,
  type StorageFolder,
} from '../services/b2StorageService';

const FOLDER_ORDER: StorageFolder[] = ['beats', 'tracks', 'projects', 'covers', 'other'];

const FOLDER_LABELS: Record<StorageFolder, string> = {
  beats: 'Биты',
  tracks: 'Треки',
  projects: 'Проекты',
  covers: 'Обложки',
  other: 'Другое',
};

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '—';
  const units = ['Б', 'КБ', 'МБ', 'ГБ'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(d?: string): string {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '' : dt.toLocaleString();
}

interface StorageExplorerProps {
  tracks: Track[];
  beats: Beat[];
  projects: Project[];
}

/**
 * Проводник хранилища (Backblaze B2) в админ-панели — вкладка «Хранилище».
 * Показывает загруженные файлы с настоящим удалением и суммарным объёмом.
 * Старые загрузки на Archive.org — на вкладке «Archive.org (легаси)».
 */
export default function StorageExplorer({ tracks, beats, projects }: StorageExplorerProps) {
  const [items, setItems] = useState<StorageItem[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState<StorageFolder | 'all'>('all');
  const [busyFile, setBusyFile] = useState<string | null>(null);

  // Файлы, на которые ссылаются карточки — предупреждаем перед удалением
  const linked = useMemo(() => {
    const m = new Map<string, string[]>();
    const add = (url: string | undefined, label: string) => {
      const p = storagePathFromUrl(url || '');
      if (!p) return;
      const arr = m.get(p) || [];
      arr.push(label);
      m.set(p, arr);
    };
    for (const t of tracks) {
      add(t.platformUrl, `Трек «${t.title}»`);
      add(t.projectZipUrl, `Проект трека «${t.title}»`);
      for (const pz of t.projectZips || []) add(pz.zipUrl, `Проект «${pz.projectName}» (трек «${t.title}»)`);
    }
    for (const b of beats) add(b.platformUrl, `Бит «${b.title}»`);
    for (const p of projects) add(p.zipUrl, `Проект «${p.name}»`);
    return m;
  }, [tracks, beats, projects]);

  const refresh = useCallback(async () => {
    setLoadError('');
    setItems(null);
    try {
      const list = await listStorageFiles();
      list.sort((a, b) => (b.updated || '').localeCompare(a.updated || '') || a.path.localeCompare(b.path));
      setItems(list);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Не удалось загрузить список файлов');
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const counts = useMemo(() => {
    const list = items || [];
    const c: Record<string, number> = { all: list.length };
    for (const f of FOLDER_ORDER) c[f] = list.filter((it) => it.folder === f).length;
    return c;
  }, [items]);

  const usage = useMemo(() => {
    const list = items || [];
    return { usedBytes: list.reduce((s, f) => s + (f.size || 0), 0), fileCount: list.length };
  }, [items]);

  const visible = useMemo(() => {
    const list = items || [];
    const q = query.trim().toLowerCase();
    return list.filter((it) => {
      if (folder !== 'all' && it.folder !== folder) return false;
      if (!q) return true;
      return it.path.toLowerCase().includes(q);
    });
  }, [items, folder, query]);

  const removeFile = async (item: StorageItem) => {
    if (busyFile) return;
    const usedBy = linked.get(item.path);
    const warn = usedBy?.length
      ? `\n\nВнимание: файл используется: ${usedBy.join('; ')}. После удаления воспроизведение/скачивание перестанет работать.`
      : '';
    if (!window.confirm(`Удалить файл «${item.name}» из хранилища? Действие необратимо.${warn}`)) return;
    setBusyFile(item.path);
    try {
      await deleteStorageFile(item.path);
      setItems((prev) => (prev || []).filter((x) => x.path !== item.path));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Не удалось удалить файл');
    } finally {
      setBusyFile(null);
    }
  };

  const downloadFile = (item: StorageItem) => {
    if (item.publicUrl) window.open(item.publicUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="archive-explorer">
      <div className="archive-explorer-toolbar">
        <div className="archive-explorer-folders">
          <button type="button" className={`archive-folder ${folder === 'all' ? 'active' : ''}`} onClick={() => setFolder('all')}>
            📁 Все ({counts.all})
          </button>
          {FOLDER_ORDER.map((f) => (
            <button key={f} type="button" className={`archive-folder ${folder === f ? 'active' : ''}`} onClick={() => setFolder(f)}>
              📁 {FOLDER_LABELS[f]} ({counts[f] || 0})
            </button>
          ))}
        </div>
        <input
          className="archive-explorer-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по пути файла…"
        />
        <button type="button" className="btn-secondary" onClick={() => void refresh()} disabled={items === null}>
          Обновить
        </button>
      </div>

      {usage.fileCount > 0 && (
        <div className="archive-explorer-usage" title="Суммарный размер файлов в хранилище (Backblaze B2)">
          💾 Занято в хранилище: {formatBytes(usage.usedBytes)} · файлов: {usage.fileCount}
        </div>
      )}

      {loadError && <div className="archive-explorer-error">{loadError}</div>}
      {items === null && <div className="archive-explorer-loading">Загрузка файлов хранилища…</div>}

      {items !== null && visible.length === 0 && (
        <div className="empty-state">
          В этой папке файлов нет. Новые загрузки (биты, проекты) появятся здесь сразу после публикации.
          Старые файлы на Archive.org — на вкладке «Archive.org (легаси)».
        </div>
      )}

      <div className="archive-item-list">
        {visible.map((it) => {
          const busy = busyFile === it.path;
          const usedBy = linked.get(it.path) || [];
          return (
            <div className="archive-file-row" key={it.path}>
              <span className="archive-file-name" title={it.path}>{it.name}</span>
              <span className="archive-file-format">{FOLDER_LABELS[it.folder]}</span>
              <span className="archive-file-size">{formatBytes(it.size)}</span>
              <span className="archive-file-updated">{formatDate(it.updated)}</span>
              <button type="button" className="btn-small-ghost" title="Скачать" onClick={() => downloadFile(it)}>
                ⬇
              </button>
              <button
                type="button"
                className="btn-reject"
                disabled={busy}
                title={usedBy.length ? `Используется: ${usedBy.join('; ')}` : 'Удалить'}
                onClick={() => void removeFile(it)}
              >
                {busy ? 'Удаление…' : 'Удалить'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}