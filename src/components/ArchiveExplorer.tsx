import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Track, Project } from '../types/track';
import type { Beat } from '../types/beat';
import {
  listAccountItems,
  findItemByIdentifier,
  fetchItemFiles,
  deleteArchiveFile,
  deleteArchiveItem,
  extractItemIdFromUrl,
  type ArchiveItemBrief,
  type ArchiveItemFile,
} from '../services/archiveService';

type StorageFolder = 'beats' | 'tracks' | 'projects' | 'other';

const FOLDER_ORDER: StorageFolder[] = ['beats', 'tracks', 'projects', 'other'];

const FOLDER_LABELS: Record<StorageFolder, string> = {
  beats: 'Биты',
  tracks: 'Треки',
  projects: 'Проекты',
  other: 'Другое',
};

function folderOf(identifier: string): StorageFolder {
  const id = identifier.toLowerCase();
  if (id.startsWith('vtgbeat-')) return 'beats';
  if (id.startsWith('vtgtrack-')) return 'tracks';
  if (id.startsWith('vtgproj-')) return 'projects';
  return 'other';
}

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

interface ArchiveExplorerProps {
  tracks: Track[];
  beats: Beat[];
  projects: Project[];
}

/**
 * «Проводник» хранилища аккаунта Archive.org в админ-панели.
 * Папки: Биты (vtgbeat-*), Треки (vtgtrack-*), Проекты (vtgproj-*), Другое.
 * Файлы можно открывать и удалять; айтемы — удалять целиком.
 */
export default function ArchiveExplorer({ tracks, beats, projects }: ArchiveExplorerProps) {
  const [items, setItems] = useState<ArchiveItemBrief[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState<StorageFolder | 'all'>('all');
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [files, setFiles] = useState<ArchiveItemFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState('');
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [busyFile, setBusyFile] = useState<string | null>(null);
  const [manualId, setManualId] = useState('');
  const [manualBusy, setManualBusy] = useState(false);
  const [manualError, setManualError] = useState('');

  // Айтемы, на которые ссылаются карточки (треки/биты/проекты) — предупреждаем перед удалением
  const linked = useMemo(() => {
    const m = new Map<string, string[]>();
    const add = (url: string | undefined, label: string) => {
      const iid = extractItemIdFromUrl(url);
      if (!iid) return;
      const arr = m.get(iid) || [];
      arr.push(label);
      m.set(iid, arr);
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
    setOpenedId(null);
    setFiles([]);
    try {
      const list = await listAccountItems();
      list.sort((a, b) => (b.addeddate || '').localeCompare(a.addeddate || ''));
      setItems(list);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Не удалось загрузить список файлов');
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openItem = async (identifier: string) => {
    if (openedId === identifier) {
      setOpenedId(null);
      setFiles([]);
      return;
    }
    setOpenedId(identifier);
    setFiles([]);
    setFilesError('');
    setFilesLoading(true);
    try {
      const fl = await fetchItemFiles(identifier);
      setFiles(fl);
    } catch (e) {
      setFilesError(e instanceof Error ? e.message : 'Не удалось получить список файлов');
    } finally {
      setFilesLoading(false);
    }
  };

  const removeFile = async (identifier: string, f: ArchiveItemFile) => {
    if (busyFile) return;
    if (!window.confirm(`Удалить файл «${f.name}» из хранилища Archive.org? Действие необратимо.`)) return;
    setBusyFile(`${identifier}:${f.name}`);
    try {
      await deleteArchiveFile(identifier, f.name);
      setFiles((prev) => prev.filter((x) => x.name !== f.name));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Не удалось удалить файл');
    } finally {
      setBusyFile(null);
    }
  };

  const removeItem = async (identifier: string) => {
    if (busyItem) return;
    const usedBy = linked.get(identifier);
    const warn = usedBy?.length
      ? `\n\nВнимание: этот айтем используется: ${usedBy.join('; ')}. После удаления прослушивание перестанет работать.`
      : '';
    if (!window.confirm(`Удалить айтем «${identifier}» целиком из хранилища Archive.org? Действие необратимо.${warn}`)) return;
    setBusyItem(identifier);
    try {
      await deleteArchiveItem(identifier);
      if (openedId === identifier) {
        setOpenedId(null);
        setFiles([]);
      }
      await refresh();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Не удалось удалить айтем');
    } finally {
      setBusyItem(null);
    }
  };

  const loadManual = async () => {
    const id = manualId.trim();
    if (!id || manualBusy) return;
    setManualBusy(true);
    setManualError('');
    try {
      const brief = await findItemByIdentifier(id);
      if (!brief) {
        setManualError(`Айтем «${id}» не найден`);
        return;
      }
      setItems((prev) => {
        const base = prev || [];
        if (base.some((x) => x.identifier === brief.identifier)) return base;
        return [brief, ...base];
      });
      setFolder(folderOf(brief.identifier));
      setQuery('');
      void openItem(brief.identifier);
      setManualId('');
    } catch (e) {
      setManualError(e instanceof Error ? e.message : 'Не удалось найти айтем');
    } finally {
      setManualBusy(false);
    }
  };

  const visible = useMemo(() => {
    const list = items || [];
    const q = query.trim().toLowerCase();
    return list.filter((it) => {
      if (folder !== 'all' && folderOf(it.identifier) !== folder) return false;
      if (!q) return true;
      return it.identifier.toLowerCase().includes(q) || (it.title || '').toLowerCase().includes(q);
    });
  }, [items, folder, query]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items?.length || 0 };
    for (const f of FOLDER_ORDER) c[f] = (items || []).filter((it) => folderOf(it.identifier) === f).length;
    return c;
  }, [items]);

  return (
    <div className="archive-explorer">
      <div className="archive-explorer-toolbar">
        <div className="archive-explorer-folders">
          <button
            type="button"
            className={`archive-folder ${folder === 'all' ? 'active' : ''}`}
            onClick={() => setFolder('all')}
          >
            📁 Все ({counts.all})
          </button>
          {FOLDER_ORDER.map((f) => (
            <button
              key={f}
              type="button"
              className={`archive-folder ${folder === f ? 'active' : ''}`}
              onClick={() => setFolder(f)}
            >
              📁 {FOLDER_LABELS[f]} ({counts[f] || 0})
            </button>
          ))}
        </div>
        <input
          className="archive-explorer-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по идентификатору или названию…"
        />
        <button type="button" className="btn-secondary" onClick={() => void refresh()} disabled={items === null}>
          Обновить
        </button>
      </div>

      <div className="archive-explorer-manual">
        <input
          type="text"
          value={manualId}
          onChange={(e) => setManualId(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void loadManual();
            }
          }}
          placeholder="Точный идентификатор айтема (напр. vtgbeat-lx1a), если его нет в списке"
        />
        <button type="button" className="btn-primary" disabled={manualBusy || !manualId.trim()} onClick={() => void loadManual()}>
          {manualBusy ? 'Поиск…' : 'Найти'}
        </button>
        {manualError && <span className="archive-explorer-error">{manualError}</span>}
      </div>

      {loadError && <div className="archive-explorer-error">{loadError}</div>}
      {items === null && <div className="archive-explorer-loading">Загрузка файлов хранилища…</div>}

      {items !== null && visible.length === 0 && (
        <div className="empty-state">
          В этой папке файлов нет. Поиск Archive.org индексируется с задержкой в несколько минут —
          свежезагруженные файлы можно найти по точному идентификатору выше.
        </div>
      )}

      <div className="archive-item-list">
        {visible.map((it) => {
          const isOpen = openedId === it.identifier;
          const linkedNames = linked.get(it.identifier) || [];
          return (
            <div className={`archive-item ${isOpen ? 'open' : ''}`} key={it.identifier}>
              <div className="archive-item-row" onClick={() => void openItem(it.identifier)}>
                <span className="archive-item-caret">{isOpen ? '▼' : '▶'}</span>
                <span
                  className={`archive-item-badge archive-item-badge-${folderOf(it.identifier)}`}
                  title={`Папка: ${FOLDER_LABELS[folderOf(it.identifier)]}`}
                >
                  {FOLDER_LABELS[folderOf(it.identifier)]}
                </span>
                <span className="archive-item-name" title={it.identifier}>{it.title || it.identifier}</span>
                <span className="archive-item-size">{formatBytes(it.size)}</span>
                <span className="archive-item-date">{formatDate(it.addeddate)}</span>
                <a
                  className="archive-item-link"
                  href={`https://archive.org/details/${encodeURIComponent(it.identifier)}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title="Открыть на Archive.org"
                >
                  ↗
                </a>
                <button
                  type="button"
                  className="btn-reject"
                  disabled={busyItem === it.identifier}
                  onClick={(e) => {
                    e.stopPropagation();
                    void removeItem(it.identifier);
                  }}
                >
                  {busyItem === it.identifier ? 'Удаление…' : 'Удалить'}
                </button>
              </div>
              {linkedNames.length > 0 && (
                <div className="archive-item-linked">Используется: {linkedNames.join('; ')}</div>
              )}
              {isOpen && (
                <div className="archive-file-list">
                  {filesLoading && <div className="archive-explorer-loading">Загрузка файлов…</div>}
                  {filesError && <div className="archive-explorer-error">{filesError}</div>}
                  {!filesLoading && !filesError && files.length === 0 && (
                    <div className="archive-explorer-loading">Файлы не найдены</div>
                  )}
                  {files.map((f) => {
                    const busy = busyFile === `${it.identifier}:${f.name}`;
                    return (
                      <div className="archive-file-row" key={f.name}>
                        <span className="archive-file-name" title={f.name}>{f.name}</span>
                        <span className="archive-file-format">{f.format || ''}</span>
                        <span className="archive-file-size">{formatBytes(f.size)}</span>
                        <a
                          className="archive-item-link"
                          href={`https://archive.org/download/${encodeURIComponent(it.identifier)}/${f.name.split('/').map(encodeURIComponent).join('/')}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title="Скачать"
                        >
                          ⬇
                        </a>
                        <button
                          type="button"
                          className="btn-reject"
                          disabled={busy}
                          onClick={(e) => {
                            e.stopPropagation();
                            void removeFile(it.identifier, f);
                          }}
                        >
                          {busy ? 'Удаление…' : 'Удалить'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
