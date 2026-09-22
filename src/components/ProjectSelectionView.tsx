import { useMemo, useState } from 'react';
import type { EduProject } from '../types/eduProject';
import { EDU_PROJECT_PLACEHOLDERS } from '../types/eduProjectPlaceholders';
import { EDU_PROJECT_DEFAULT_DATA } from '../types/eduProjectDefaultData';

interface ProjectSelectionViewProps {
  projects: EduProject[];
  loading: boolean;
  canEdit: boolean;
  onImportPlaceholders: () => Promise<number>;
  onDelete: (id: string) => Promise<void>;
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ru-RU', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function exportCsv(projects: EduProject[]) {
  const header = [
    '№', 'Название', 'Дата записи (по)', 'Заказчик', 'Организация',
    'Куратор', 'Направление', 'Мест осталось', 'Мест всего', 'Статус',
  ];
  const lines = [
    header.join(';'),
    ...projects.map((p, i) => [
      i + 1,
      p.name,
      fmtDate(p.selectionDeadline),
      p.customer || '',
      p.organization || '',
      p.curator || p.programManager || '',
      p.direction || '',
      p.placesLeft,
      p.placesTotal,
      p.status || '',
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')),
  ];
  const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'Выбор_проектов.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function ProjectSelectionView({
  projects,
  loading,
  canEdit,
  onImportPlaceholders,
  onDelete,
}: ProjectSelectionViewProps) {
  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Если в Firestore записей нет — показываем выгрузку с сайта (или заглушки)
    const fallback = EDU_PROJECT_DEFAULT_DATA.length > 0
      ? EDU_PROJECT_DEFAULT_DATA
      : EDU_PROJECT_PLACEHOLDERS;
    const list = projects.length > 0 ? projects : fallback.map((p, i) => ({
      ...p,
      id: `ph:${i}`,
      createdAt: '',
      updatedAt: '',
    } as EduProject));
    if (!q) return list;
    return list.filter((p) =>
      [p.name, p.customer, p.organization, p.curator, p.direction]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q))
    );
  }, [projects, search]);

  const importPlaceholders = async () => {
    setImporting(true);
    setImportMsg(null);
    try {
      const n = await onImportPlaceholders();
      setImportMsg(`Загружено в базу проектов: ${n}.`);
      setTimeout(() => setImportMsg(null), 5000);
    } catch {
      setImportMsg('Не удалось загрузить проекты в базу.');
      setTimeout(() => setImportMsg(null), 5000);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="projects-view">
      <div className="beats-head">
        <h2>Выбор проектов</h2>
        <div className="projects-head-actions">
          {canEdit && projects.length === 0 && (
            <button className="btn-primary" disabled={importing} onClick={() => void importPlaceholders()}>
              {importing ? 'Загружаем…' : 'Загрузить проекты'}
            </button>
          )}
          <button className="btn-secondary" onClick={() => exportCsv(filtered)}>
            ⬇ Скачать CSV
          </button>
        </div>
      </div>

      {importMsg && <div className="success-msg">{importMsg}</div>}

      <div className="tracks-toolbar">
        <input
          className="beats-search"
          placeholder="Поиск по названию, заказчику, куратору, направлению…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="tracks-count">
          {filtered.length} {projects.length === 0 ? '(выгрузка с сайта)' : ''}
        </span>
      </div>

      {loading ? (
        <div className="loading-screen">
          <div className="loading-spinner-container">
            <span className="loading-spinner" />
            <span>Загрузка проектов…</span>
          </div>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table proj-select-table">
            <thead>
              <tr>
                <th>№</th>
                <th>Название</th>
                <th>Дата записи (по)</th>
                <th>Заказчик</th>
                <th>Куратор</th>
                <th>Направление</th>
                <th>Мест осталось</th>
                <th>Статус</th>
                {canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr key={p.id}>
                  <td>{i + 1}</td>
                  <td className="proj-title">{p.name}</td>
                  <td>{fmtDate(p.selectionDeadline)}</td>
                  <td>
                    {p.customer || '—'}
                    {p.organization ? <div className="proj-sub">{p.organization}</div> : null}
                  </td>
                  <td>{p.curator || p.programManager || '—'}</td>
                  <td>{p.direction || '—'}</td>
                  <td className={p.placesLeft > 0 ? 'proj-places-ok' : 'proj-places-none'}>
                    {p.placesLeft}
                    {p.placesTotal ? ` / ${p.placesTotal}` : ''}
                  </td>
                  <td>{p.status || '—'}</td>
                  {canEdit && (
                    <td>
                      <button
                        className="row-delete"
                        title="Удалить"
                        disabled={deletingId === p.id}
                        onClick={() => {
                          if (!window.confirm(`Удалить проект «${p.name}»?`)) return;
                          setDeletingId(p.id);
                          void onDelete(p.id).finally(() => setDeletingId(null));
                        }}
                      >
                        ×
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 9 : 8} className="beats-empty">
                    Ничего не найдено. Измените запрос поиска.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}