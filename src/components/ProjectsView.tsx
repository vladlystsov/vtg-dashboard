import { useState, useMemo, useRef } from 'react';
import type { SoundProject } from '../types/track';
import { useAuth } from '../contexts/AuthContext';
import {
  createProject,
  deleteProject,
  addFileToProject,
  removeFileFromProject,
} from '../services/projectService';

interface ProjectsViewProps {
  projects: SoundProject[];
}

export default function ProjectsView({ projects }: ProjectsViewProps) {
  const { profile } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const myProjects = useMemo(
    () => projects.filter((p) => p.beatmakerUid === profile?.uid),
    [projects, profile]
  );

  const isBeatmaker = profile?.roles?.includes('beatmaker') || profile?.role === 'admin' || profile?.role === 'owner';

  const handleCreate = async () => {
    if (!newName.trim() || !profile) return;
    setSaving(true);
    setError('');
    try {
      await createProject({
        name: newName.trim(),
        description: newDesc.trim(),
        beatmakerUid: profile.uid,
        beatmakerName: profile.artistName || profile.displayName,
      });
      setNewName('');
      setNewDesc('');
      setShowForm(false);
    } catch (e: any) {
      setError(e?.message || 'Не удалось создать проект.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Удалить проект «${name}»?`)) return;
    try {
      await deleteProject(id);
    } catch (e: any) {
      alert(e?.message || 'Не удалось удалить.');
    }
  };

  const handleFileUpload = async (projectId: string) => {
    const input = fileInputRef.current;
    if (!input || !input.files || input.files.length === 0) return;
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;

    setUploadingId(projectId);
    try {
      for (const file of Array.from(input.files)) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
          reader.readAsDataURL(file);
        });
        await addFileToProject(
          projectId,
          { name: file.name, url: dataUrl, type: file.type, size: file.size },
          project.files || []
        );
      }
      input.value = '';
    } catch (e: any) {
      alert(e?.message || 'Не удалось загрузить файл.');
    } finally {
      setUploadingId(null);
    }
  };

  const handleRemoveFile = async (projectId: string, fileId: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    if (!confirm('Удалить файл?')) return;
    try {
      await removeFileFromProject(projectId, fileId, project.files || []);
    } catch (e: any) {
      alert(e?.message || 'Не удалось удалить файл.');
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  };

  return (
    <div className="projects-view">
      <div className="projects-header">
        <h2>Мои проекты</h2>
        {isBeatmaker && (
          <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Отмена' : '+ Новый проект'}
          </button>
        )}
      </div>

      {showForm && (
        <div className="project-create-form">
          <div className="form-group">
            <label>Название проекта *</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Название проекта"
            />
          </div>
          <div className="form-group">
            <label>Описание</label>
            <textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Описание проекта (для звукорежиссёра)"
              rows={3}
            />
          </div>
          <div className="project-form-actions">
            <button className="btn-primary" onClick={handleCreate} disabled={saving || !newName.trim()}>
              {saving ? 'Создание...' : 'Создать проект'}
            </button>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Отмена</button>
          </div>
          {error && <div className="error-msg">{error}</div>}
        </div>
      )}

      <div className="projects-list">
        {myProjects.length === 0 && (
          <div className="empty-state">
            {isBeatmaker
              ? 'Пока нет проектов. Создайте проект и загрузите биты для звукорежиссёра.'
              : 'Нет доступных проектов.'}
          </div>
        )}
        {myProjects.map((project) => (
          <div className="project-card" key={project.id}>
            <div className="project-card-header" onClick={() => setExpandedId(expandedId === project.id ? null : project.id)}>
              <div className="project-card-info">
                <div className="project-card-name">{project.name}</div>
                {project.description && (
                  <div className="project-card-desc">{project.description}</div>
                )}
                <div className="project-card-meta">
                  <span>{project.files?.length || 0} файлов</span>
                  <span>{new Date(project.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="project-card-actions">
                {isBeatmaker && (
                  <>
                    <input
                      type="file"
                      ref={fileInputRef}
                      style={{ display: 'none' }}
                      accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus"
                      multiple
                      onChange={() => {
                        if (selectedProjectId) handleFileUpload(selectedProjectId);
                      }}
                    />
                    <button
                      className="btn-small-ghost"
                      disabled={uploadingId === project.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedProjectId(project.id);
                        fileInputRef.current?.click();
                      }}
                      title="Загрузить файлы"
                    >
                      {uploadingId === project.id ? '...' : 'Файлы'}
                    </button>
                  </>
                )}
                {project.beatmakerUid === profile?.uid && (
                  <button
                    className="btn-small-ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(project.id, project.name);
                    }}
                    title="Удалить проект"
                  >
                    x
                  </button>
                )}
              </div>
            </div>

            {expandedId === project.id && (
              <div className="project-files">
                {(project.files || []).length === 0 && (
                  <div className="project-files-empty">Нет загруженных файлов</div>
                )}
                {(project.files || []).map((file) => (
                  <div className="project-file" key={file.id}>
                    <div className="project-file-info">
                      <span className="project-file-name">{file.name}</span>
                      <span className="project-file-size">{formatSize(file.size)}</span>
                    </div>
                    {file.url && file.type.startsWith('audio/') && (
                      <audio controls preload="metadata" style={{ width: '100%', height: 36 }} src={file.url} />
                    )}
                    {file.url && !file.type.startsWith('audio/') && (
                      <a className="btn-small-ghost" href={file.url} target="_blank" rel="noopener noreferrer" download={file.name}>
                        Скачать
                      </a>
                    )}
                    {project.beatmakerUid === profile?.uid && (
                      <button
                        className="btn-small-ghost"
                        onClick={() => handleRemoveFile(project.id, file.id)}
                        title="Удалить файл"
                      >
                        x
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
