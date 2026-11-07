import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project, Track, TrackProjectZip, TrackStatus, UserProfile } from '../types/track';
import {
  PROJECT_DAW_LABELS,
  PROJECT_STAGE_LABELS,
  PROJECT_STAGES,
  PROJECT_VARIANT_LABELS,
  PROJECT_VOCAL_TYPES,
  PROJECT_VOCAL_TYPE_LABELS,
  STATUS_LABELS,
} from '../types/track';
import type { ProjectDaw, ProjectStage, ProjectVariant, ProjectVocalType } from '../types/track';
import { checkProjectZipFile, publishProjectZipInBackground } from '../services/b2StorageService';
import { DownloadButton } from './TracksListView';
import { asArray } from '../types/track';

interface ProjectsViewProps {
  projects: Project[];
  tracks: Track[];
  userMap: Map<string, UserProfile>;
  canEdit: boolean;
  onSave: (
    id: string | null,
    data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>
  ) => Promise<string | undefined>;
  onDelete: (id: string) => Promise<void>;
  onUpdateTrack: (id: string, patch: Partial<Track>) => Promise<void>;
  /** РћС‡РёСЃС‚РєР° РїРѕР»РµР№ РїСЂРѕРµРєС‚Р° (undefined = СѓРґР°Р»РёС‚СЊ зеле): РЅСѓР¶РЅР°, С‡С‚РѕР±С‹ СЃРЅСЏС‚СЊ Р·Р°РІРёСЃС€РёР№ СЃС‚Р°С‚СѓСЃ Р·Р°РіСЂСѓР·РєРё. */
  onUpdateProjectFields?: (id: string, patch: Record<string, unknown>) => Promise<void>;
  onOpenTrack?: (track: Track) => void;
}

function projectTrackIds(p: Project): string[] {
  const ids = Array.isArray(p.trackIds) ? p.trackIds : [];
  const legacy = Array.isArray(p.tracks) ? p.tracks.filter((x): x is string => typeof x === 'string') : [];
  return Array.from(new Set([...ids, ...legacy]));
}

interface VersionFormState {
  editing?: Project;
  trackIds: string[];
  name: string;
  variant: ProjectVariant;
  vocalType: ProjectVocalType | '';
  daw: ProjectDaw;
  dawVersion: string;
  stage: ProjectStage;
  zipFile: File | null;
  description: string;
  genre: string;
  tags: string;
  artists: string;
  coverUrl: string;
  status: TrackStatus;
}

const DEFAULT_DLD_VERSION = '25';

function emptyForm(preselectedTrackIds: string[] = [], preselectedTitle = ''): VersionFormState {
  return {
    trackIds: preselectedTrackIds,
    name: preselectedTitle,
    variant: 'main',
    vocalType: '',
    daw: 'fl',
    dawVersion: DEFAULT_DLD_VERSION,
    stage: 'mixing',
    zipFile: null,
    description: '',
    genre: '',
    tags: '',
    artists: '',
    coverUrl: '',
    status: 'draft',
  };
}

export default function ProjectsView({
  projects,
  tracks,
  userMap,
  canEdit,
  onSave,
  onDelete,
  onUpdateTrack,
  onUpdateProjectFields,
  onOpenTrack,
}: ProjectsViewProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingCardTrackId, setDeletingCardTrackId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [zipError, setZipError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [modal, setModal] = useState<VersionFormState | null>(null);
  const [trackSearch, setTrackSearch] = useState('');
  const [savingVersion, setSavingVersion] = useState(false);

  const uploadControllers = useRef(new Map<string, AbortController>());

  const trackById = useMemo(() => {
    const m = new Map<string, Track>();
    for (const t of tracks) m.set(t.id, t);
    return m;
  }, [tracks]);

  /**
   * РЎРЅРёРјР°РµС‚ СЃС‚Р°С‚СѓСЃ В«Р·Р°РіСЂСѓР¶Р°РµС‚СЃСЏВ» Сѓ РІРµСЂСЃРёРё: Сѓ Р·Р°РїРёСЃРё РїСЂРѕРµРєС‚Р°, Сѓ Р°СЂС…РёРІР° С‚СЂРµРєР°
   * (projectZips) или Сѓ СЃС‚Р°СЂРѕРіРѕ РѕРґРёРЅРѕС‡РЅРѕРіРѕ РїРѕР»СЏ projectZip*. РРЅР°С‡Рµ РїРѕСЃР»Рµ
   * РїСЂРµСЂРІР°РЅРЅРѕР№ Р·Р°Р»РёРІРєРё СЃРїРёРЅРЅРµСЂ РѕСЃС‚Р°С‘С‚СЃСЏ РЅР°РІСЃРµРіРґР° вЂ” и В«РћС‚РјРµРЅР°В» еже Хе СѓР±РёСЂР°РµС‚.
   */
  const clearZipStatus = (projectId: string) => {
    if (!projectId.startsWith('zip:')) {
      void onUpdateProjectFields?.(projectId, { zipStatus: undefined, zipError: undefined });
      return;
    }
    const [, trackId, zipKey] = projectId.split(':');
    const track = trackById.get(trackId);
    if (!track) return;
    if (zipKey === 'legacy') {
      void onUpdateTrack(trackId, { projectZipStatus: undefined, projectZipError: undefined });
      return;
    }
    const zips = (track.projectZips || []).map((z) =>
      z.projectId === zipKey ? { ...z, zipStatus: undefined, zipError: undefined } : z
    );
    void onUpdateTrack(trackId, { projectZips: zips.length ? zips : undefined });
  };

  // Р§РёСЃС‚РёРј Р±СЂРѕС€РµРЅРЅС‹Рµ Р·Р°РіСЂСѓР·РєРё: их РЅРµРєРѕРјСѓ Р·Р°РІРµСЂС€РёС‚СЊ, и Р±РµР· СЌС‚РѕРіРѕ РєР°СЂС‚РѕС‡РєР°
  // Р±РµСЃРєРѕРЅРµС‡РЅРѕ РїРѕРєР°Р·С‹РІР°РµС‚ В«Р—Р°РіСЂСѓР¶Р°РµРј Р°СЂС…РёРІ РІРµСЂСЃРёРё Ц С…СЂР°РЅРёР»РёС‰РµвЂ¦В».
  const healedUploads = useRef(new Set<string>());
  useEffect(() => {
    const now = Date.now();
    const stale = (stamp?: string) => {
      const time = Date.parse(stamp || '');
      return Number.isFinite(time) && now - time > STALE_UPLOAD_MS;
    };

    for (const p of projects) {
      if (p.zipStatus !== 'uploading') continue;
      if (uploadControllers.current.has(p.id) || healedUploads.current.has(p.id)) continue;
      if (!stale(p.updatedAt || p.createdAt)) continue;
      healedUploads.current.add(p.id);
      void onUpdateProjectFields?.(p.id, { zipStatus: undefined, zipError: undefined });
    }

    for (const t of tracks) {
      const patch: Record<string, unknown> = {};
      if (t.projectZipStatus === 'uploading' && stale(t.updatedAt || t.createdAt)) {
        patch.projectZipStatus = undefined;
        patch.projectZipError = undefined;
      }
      const zips = t.projectZips || [];
      if (zips.some((z) => z.zipStatus === 'uploading' && stale(z.uploadedAt))) {
        patch.projectZips = zips.map((z) =>
          z.zipStatus === 'uploading' && stale(z.uploadedAt)
            ? { ...z, zipStatus: undefined, zipError: undefined }
            : z
        );
      }
      if (Object.keys(patch).length) void onUpdateTrack(t.id, patch as Partial<Track>);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, tracks]);

  // Архив РїСЂРёРІСЏР·Р°РЅ СЃС‚СЂРѕРіРѕ д РѕРґРЅРѕРјСѓ С‚СЂРµРєСѓ. Р’РµСЂСЃРёРё (Р·Р°РїРёСЃРё Project) РёС‰СѓС‚СЃСЏ
  // зе РєРѕРЅРєСЂРµС‚РЅРѕРјСѓ id С‚СЂРµРєР°, Р° Хе зе РІСЃРµРјСѓ СЃР±РѕСЂРЅРёРєСѓ.
  const projectTrackIdsOf = (p: Project): string[] => projectTrackIds(p);

  // Р’РёСЂС‚СѓР°Р»СЊРЅС‹Рµ РІРµСЂСЃРёРё: РїСЂРѕРµРєС‚С‹, РїСЂРёРєСЂРµРїР»С‘РЅРЅС‹Рµ д С‚СЂРµРєСѓ С‡РµСЂРµР· С„РѕСЂРјСѓ С‚СЂРµРєР°
  // (projectZipUrl / projectZips), РґР»СЏ РєРѕС‚РѕСЂС‹С… РµС‰С‘ Хет
  // РѕС‚РґРµР»СЊРЅРѕР№ Р·Р°РїРёСЃРё Ц делледции projects. РћС‚РѕР±СЂР°Р¶Р°СЋС‚СЃСЏ С‚РѕР»СЊРєРѕ РґР»СЏ С‡С‚РµРЅРёСЏ.
  const virtualProjectsForTrack = (t: Track): Project[] => {
    const docIds = new Set(projects.map((p) => p.id));
    const out: Project[] = [];
    const zips = t.projectZips || [];
    for (const z of zips) {
      if (docIds.has(z.projectId)) continue;
      if (!z.zipUrl && z.zipStatus !== 'uploading' && z.zipStatus !== 'error') continue;
      out.push({
        id: `zip:${t.id}:${z.projectId}`,
        name: z.projectName || 'Архив',
        trackIds: [t.id],
        zipUrl: z.zipUrl,
        zipStatus: z.zipStatus,
        zipError: z.zipError,
        createdAt: z.uploadedAt,
        updatedAt: z.uploadedAt,
        createdBy: '',
      });
    }
    if (
      zips.length === 0 &&
      (t.projectZipUrl || t.projectZipStatus === 'uploading' || t.projectZipStatus === 'error')
    ) {
      const stamp = t.updatedAt || t.createdAt || '';
      out.push({
        id: `zip:${t.id}:legacy`,
        name: 'Архив проекта',
        trackIds: [t.id],
        zipUrl: t.projectZipUrl,
        zipStatus: t.projectZipStatus,
        zipError: t.projectZipError,
        createdAt: stamp,
        updatedAt: stamp,
        createdBy: '',
      });
    }
    return out;
  };

  const isVirtualProject = (p: Project): boolean => p.id.startsWith('zip:');

  const projectsForTrack = (t: Track): Project[] => {
    const docVersions = projects.filter((p) => projectTrackIdsOf(p).includes(t.id));
    return [...docVersions, ...virtualProjectsForTrack(t)];
  };

  // РџРѕРєР°Р·С‹РІР°РµРј РєР°СЂС‚РѕС‡РєРё РІСЃРµС… С‚СЂРµРєРѕРІ, Сѓ РєРѕС‚РѕСЂС‹С… РµСЃС‚СЊ С…РѕС‚СЏ Р±С‹ РѕРґРЅР° РІРµСЂСЃРёСЏ РїСЂРѕРµРєС‚Р°
  const projectTracks = useMemo<Track[]>(() => {
    const seen = new Set<string>();
    const out: Track[] = [];
    for (const t of tracks) {
      if (seen.has(t.id)) continue;
      const pros = projectsForTrack(t);
      if (pros.length > 0) {
        seen.add(t.id);
        out.push(t);
      }
    }
    out.sort((a, b) => {
      const la = Math.max(...(projectsForTrack(a) || []).map((p) => new Date(p.updatedAt || p.createdAt || 0).getTime()).concat(new Date(a.updatedAt || a.createdAt || 0).getTime()));
      const lb = Math.max(...(projectsForTrack(b) || []).map((p) => new Date(p.updatedAt || p.createdAt || 0).getTime()).concat(new Date(b.updatedAt || b.createdAt || 0).getTime()));
      return lb - la;
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, projects]);

  const trackArtistName = (t: Track): string =>
    asArray(t.artists).map((a) => String(a)).filter(Boolean)[0] ||
    userMap.get(t.artistUids?.[0] || '')?.artistName ||
    '';

  // Р¤РёР»СЊС‚СЂР°С†РёСЏ РєР°СЂС‚РѕС‡РµРє зе РїРѕРёСЃРєРѕРІРѕРјСѓ Р·Р°РїСЂРѕСЃСѓ: РЅР°Р·РІР°РЅРёРµ С‚СЂРµРєР°, Р°СЂС‚РёСЃС‚,
  // СЃР±РѕСЂРЅРёРє, РЅР°Р·РІР°РЅРёСЏ РІРµСЂСЃРёР№ РїСЂРѕРµРєС‚Р°.
  const visibleProjectTracks = useMemo<Track[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return projectTracks;
    return projectTracks.filter((t) => {
      const haystack = [
        t.title,
        t.project || '',
        trackArtistName(t),
        ...asArray(t.artists).map((a) => String(a)),
        ...projectsForTrack(t).map((p) => p.name),
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectTracks, searchQuery, tracks, projects, userMap]);

  const publishZip = (
    savedProject: Project,
    file: File,
    trackIds: string[]
  ) => {
    setUploadingId(savedProject.id);
    const patchTrackProjectZip = (patch: Partial<TrackProjectZip>) => {
      const now = new Date().toISOString();
      for (const trackId of trackIds) {
        const track = trackById.get(trackId);
        if (!track) continue;
        const existing = track.projectZips || [];
        const idx = existing.findIndex((z) => z.projectId === savedProject.id);
        const next: TrackProjectZip = {
          projectId: savedProject.id,
          projectName: savedProject.name,
          uploadedAt: idx >= 0 ? existing[idx].uploadedAt : now,
          ...(idx >= 0 ? existing[idx] : {}),
          ...patch,
        };
        void onUpdateTrack(track.id, {
          projectZips: idx >= 0 ? existing.map((z, i) => (i === idx ? next : z)) : [...existing, next],
        });
      }
    };
    const finishUpload = (patch: Partial<Project> & { zipError?: string }) => {
      uploadControllers.current.delete(savedProject.id);
      void onSave(savedProject.id, {
        ...savedProject,
        ...patch,
      })
        .then(() => patchTrackProjectZip({
          ...(patch.zipUrl ? { zipUrl: patch.zipUrl } : {}),
          ...(patch.zipStatus ? { zipStatus: patch.zipStatus as TrackProjectZip['zipStatus'] } : {}),
          ...(patch.zipError !== undefined ? { zipError: patch.zipError } : {}),
        }))
        .finally(() => {
          setUploadingId(null);
          setCancellingId(null);
        });
    };

    void onSave(savedProject.id, {
      ...savedProject,
      zipStatus: 'uploading',
      zipError: undefined,
    });

    const controller = new AbortController();
    uploadControllers.current.set(savedProject.id, controller);

    publishProjectZipInBackground({
      file,
      title: `VTG ${savedProject.name}`,
      description: `Архив ${savedProject.name}`,
      creator: 'VTG',
      signal: controller.signal,
      callbacks: {
        onReady: (url) => {
          finishUpload({ zipUrl: url, zipStatus: 'ready' as const, zipError: undefined });
        },
        onError: (message) => {
          finishUpload({ zipStatus: 'error' as const, zipError: message });
        },
      },
    }).catch((e) => {
      if (controller.signal.aborted) {
        finishUpload({ zipStatus: 'error' as const, zipError: 'Р—Р°РіСЂСѓР·РєР° РѕС‚РјРµРЅРµРЅР°' });
      } else if (!(e instanceof DOMException && e.name === 'AbortError')) {
        finishUpload({ zipStatus: 'error' as const, zipError: e instanceof Error ? e.message : 'РћС€РёР±РєР° РїСѓР±Р»РёРєР°С†РёРё' });
      }
    });
  };

  const cancelUpload = (projectId: string) => {
    const controller = uploadControllers.current.get(projectId);
    if (!controller) {
      // Р—Р°РіСЂСѓР·РєРё СѓР¶Рµ Хет (СѓСЃРїРµР»Р° Р·Р°РІРµСЂС€РёС‚СЊСЃСЏ, РѕС‚РјРµРЅРёС‚СЊСЃСЏ или РµС‘ Р±СЂРѕСЃРёР»Рё),
      // Р° СЃРїРёРЅРЅРµСЂ РµС‰С‘ РІРёСЃРёС‚ вЂ” СЃРЅРёРјР°РµРј и Р»РѕРєР°Р»СЊРЅРѕРµ СЃРѕСЃС‚РѕСЏРЅРёРµ, и СЃС‚Р°С‚СѓСЃ Ц Р±Р°Р·Рµ:
      // РёРЅР°С‡Рµ РїРѕСЃР»Рµ РїРµСЂРµСЂРёСЃРѕРІРєРё еХ РІРµСЂРЅС‘С‚СЃСЏ из Firestore.
      setUploadingId((id) => (id === projectId ? null : id));
      setCancellingId((id) => (id === projectId ? null : id));
      clearZipStatus(projectId);
      return;
    }
    setCancellingId(projectId);
    controller.abort();
  };

  const saveVersion = async () => {
    if (!modal) return;
    if (modal.trackIds.length === 0) {
      setZipError('Р’С‹Р±РµСЂРёС‚Рµ РѕРґРёРЅ С‚СЂРµРє, д РєРѕС‚РѕСЂРѕРјСѓ РїСЂРёРІСЏР·С‹РІР°РµС‚СЃСЏ РІРµСЂСЃРёСЏ РїСЂРѕРµРєС‚Р°.');
      setTimeout(() => setZipError(null), 4000);
      return;
    }
    if (modal.zipFile) {
      const err = checkProjectZipFile(modal.zipFile);
      if (err) {
        setZipError(err);
        setTimeout(() => setZipError(null), 4000);
        return;
      }
    }
    const name = modal.name.trim() || 'Новый проект';
    const payload: Omit<Project, 'id' | 'createdAt' | 'updatedAt'> = {
      name,
      trackIds: modal.trackIds,
      variant: modal.variant,
      vocalType: modal.vocalType ? (modal.vocalType as ProjectVocalType) : undefined,
      daw: modal.daw,
      dawVersion: modal.dawVersion.trim() || undefined,
      stage: modal.stage,
      // Р РѕР»СЊ В«Р°РєС‚РёРІРЅРѕР№ РІРµСЂСЃРёРёВ» РІС‹РїРѕР»РЅСЏРµС‚ РІР°СЂРёР°РЅС‚ В«РћСЃРЅРѕРІРЅРѕР№В» (variant === 'main')
      active: modal.variant === 'main',
      zipStatus: modal.zipFile ? ('uploading' as const) : undefined,
      description: modal.description.trim() || undefined,
      genre: modal.genre.trim() || undefined,
      artists: modal.artists.split(',').map((s) => s.trim()).filter(Boolean).length
        ? modal.artists.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined,
      tags: modal.tags.split(',').map((s) => s.trim()).filter(Boolean).length
        ? modal.tags.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined,
      coverUrl: modal.coverUrl.trim() || undefined,
      status: modal.status,
      createdBy: modal.editing?.createdBy || '',
    };
    setSavingVersion(true);
    setZipError(null);
    try {
      if (modal.editing) {
        await onSave(modal.editing.id, payload);
        if (modal.zipFile) {
          publishZip({ ...modal.editing, ...payload } as Project, modal.zipFile, modal.trackIds);
        }
      } else {
        const id = await onSave(null, { ...payload, createdBy: '' });
        if (id) {
          const saved = { id, ...payload } as Project;
          if (modal.zipFile) publishZip(saved, modal.zipFile, modal.trackIds);
        }
      }
      setModal(null);
    } finally {
      setSavingVersion(false);
    }
  };

  // Р—Р°РіСЂСѓР·РєР° СЃС‡РёС‚Р°РµС‚СЃСЏ В«Р¶РёРІРѕР№В», РµСЃР»Рё РѕРЅР° РµСЃС‚СЊ Ц РїР°РјСЏС‚Рё СЌС‚РѕРіРѕ СЌРєСЂР°РЅР° Р»РёР±Рѕ
  // Р·Р°РїРёСЃСЊ РѕР± «uploading» СЃРІРµР¶Р°СЏ. РРЅР°С‡Рµ СЌС‚Рѕ СЃР»РµРґ РїСЂРµСЂРІР°РЅРЅРѕР№ Р·Р°РіСЂСѓР·РєРё (Р·Р°РєСЂС‹Р»Рё
  // СЃС‚СЂР°РЅРёС†Сѓ/РїСЂРёР»РѕР¶РµРЅРёРµ): С„Р°Р№Р»Р° СѓР¶Рµ Хет, и СЃРїРёРЅРЅРµСЂ Хе РґРѕР»Р¶РµРЅ РєСЂСѓС‚РёС‚СЊСЃСЏ ЦечХе.
  const STALE_UPLOAD_MS = 15 * 60 * 1000;
  const isStaleUploading = (p: Project): boolean => {
    if (p.zipStatus !== 'uploading') return false;
    if (uploadingId === p.id || uploadControllers.current.has(p.id)) return false;
    const stamp = new Date(p.updatedAt || p.createdAt || 0).getTime();
    return !Number.isFinite(stamp) || Date.now() - stamp > STALE_UPLOAD_MS;
  };

  const renderZipSection = (p: Project) => {
    if (isStaleUploading(p)) {
      return (
        <div className="project-zip project-zip-error">
          <span>
            Р—Р°РіСЂСѓР·РєР° Р°СЂС…РёРІР° РїСЂРµСЂРІР°РЅР°. РћС‚РєСЂРѕР№С‚Рµ РІРµСЂСЃРёСЋ, С‡С‚РѕР±С‹ РїСЂРёРєСЂРµРїРёС‚СЊ Р°СЂС…РёРІ Р·Р°РЅРѕРІРѕ.
          </span>
        </div>
      );
    }
    if (uploadingId === p.id || p.zipStatus === 'uploading') {
      return (
        <div className="project-zip project-zip-uploading">
          <span className="project-zip-spinner" />
          <span className="project-zip-cancel-label">
            {cancellingId === p.id ? 'РћС‚РјРµРЅСЏРµРјвЂ¦' : 'Р—Р°РіСЂСѓР¶Р°РµРј Р°СЂС…РёРІ РІРµСЂСЃРёРё Ц С…СЂР°РЅРёР»РёС‰РµвЂ¦'}
          </span>
          {canEdit && (
            <button
              type="button"
              className="project-zip-cancel"
              title="РћС‚РјРµРЅРёС‚СЊ Р·Р°РіСЂСѓР·РєСѓ"
              disabled={cancellingId === p.id}
              onClick={(e) => {
                // Р“Р°СЃРёРј РІСЃРїР»С‹С‚РёРµ: РёРЅР°С‡Рµ длид РѕС‚РєСЂРѕРµС‚ СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ РІРµСЂСЃРёРё.
                e.stopPropagation();
                cancelUpload(p.id);
              }}
            >
              вњ•
            </button>
          )}
        </div>
      );
    }
    if (p.zipStatus === 'error' || p.zipError) {
      return (
        <div className="project-zip project-zip-error">
          <span>{p.zipError || 'РћС€РёР±РєР° РїСѓР±Р»РёРєР°С†РёРё'}</span>
        </div>
      );
    }
    if (p.zipUrl) {
      return (
        <div className="project-zip project-zip-ready">
          <span className="project-zip-ok">вњ“</span>
          <DownloadButton
            url={p.zipUrl}
            title={`РђСЂС…РёРІ ${p.name}`}
            fileName={`VTG ${p.name}.zip`}
            hrefTitle="РЎРєР°С‡Р°С‚СЊ Р°СЂС…РёРІ РІРµСЂСЃРёРё"
          >
            РЎРєР°С‡Р°С‚СЊ Р°СЂС…РёРІ РІРµСЂСЃРёРё
          </DownloadButton>
        </div>
      );
    }
    return null;
  };

  const openNewVersion = (t?: Track) => {
    setTrackSearch('');
    setModal(emptyForm(t ? [t.id] : [], t ? t.title : ''));
  };

  const openEditVersion = (p: Project) => {
    setTrackSearch('');
    setModal({
      ...emptyForm(projectTrackIds(p), p.name),
      editing: p,
      variant: p.variant || 'main',
      vocalType: (p.vocalType || '') as ProjectVocalType | '',
      daw: p.daw || 'fl',
      dawVersion: p.dawVersion || '',
      stage: p.stage || 'mixing',
      description: p.description || '',
      genre: p.genre || '',
      tags: (p.tags || []).join(', '),
      artists: (p.artists || []).join(', '),
      coverUrl: p.coverUrl || '',
      status: p.status || 'draft',
    });
  };

  // РЎРїРёСЃРѕРє С‚СЂРµРєРѕРІ РґР»СЏ СЃРµР»РµРєС‚РѕСЂР° Ц РјРѕРґР°Р»РєРµ РІРµСЂСЃРёРё (СЃ РїРѕРёСЃРєРѕРј)
  const trackSearchQuery = trackSearch.trim().toLowerCase();
  const visibleTrackOptions = trackSearchQuery
    ? tracks.filter((t) => {
        const haystack = [
          t.title,
          t.project || '',
          trackArtistName(t),
          ...asArray(t.artists).map((a) => String(a)),
        ].join(' ').toLowerCase();
        return (
          haystack.includes(trackSearchQuery) ||
          String(t.trackNumber ?? '').includes(trackSearchQuery)
        );
      })
    : tracks;

  return (
    <div className="projects-view">
      <div className="beats-head">
        <h2>АрхивС‹</h2>
        <input
          className="beats-search"
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="РџРѕРёСЃРє зе РЅР°Р·РІР°РЅРёСЋ С‚СЂРµРєР°, Р°СЂС‚РёСЃС‚Сѓ, СЃР±РѕСЂРЅРёРєСѓ, РІРµСЂСЃРёРёвЂ¦"
        />
        <div className="projects-head-actions">
          <button className="btn-primary" onClick={() => openNewVersion()}>
            + РќРѕРІР°СЏ РІРµСЂСЃРёСЏ
          </button>
        </div>
      </div>

      {zipError && <div className="error-msg">{zipError}</div>}

      {projectTracks.length === 0 ? (
        <div className="beats-empty">
          АрхивРѕРІ РїРѕРєР° Хет. РљР°Р¶РґС‹Р№ РїСЂРѕРµРєС‚ РїСЂРёРІСЏР·С‹РІР°РµС‚СЃСЏ д РѕРґРЅРѕРјСѓ РєРѕРЅРєСЂРµС‚РЅРѕРјСѓ С‚СЂРµРєСѓ
          (СЃРёРЅРіР» или С‚СЂРµРє из СЃР±РѕСЂРЅРёРєР°). РЎРѕР·РґР°Р№С‚Рµ РїРµСЂРІСѓСЋ РІРµСЂСЃРёСЋ РїСЂРѕРµРєС‚Р° вЂ” и РєР°СЂС‚РѕС‡РєР° С‚СЂРµРєР° РїРѕСЏРІРёС‚СЃСЏ Р·РґРµСЃСЊ.
        </div>
      ) : visibleProjectTracks.length === 0 ? (
        <div className="beats-empty">
          пе Р·Р°РїСЂРѕСЃСѓ «{searchQuery.trim()}» Хичеже Хе РЅР°Р№РґРµРЅРѕ.
        </div>
      ) : (
        <div className="projects-grid">
          {visibleProjectTracks.map((t) => {
            const versions = projectsForTrack(t);
            const trackArtist = trackArtistName(t);
            return (
              <div
                className="release-card project-track-card"
                key={t.id}
                onClick={() => onOpenTrack?.(t)}
                role={onOpenTrack ? 'button' : undefined}
                title={onOpenTrack ? 'РћС‚РєСЂС‹С‚СЊ С‚СЂРµРє' : undefined}
              >
                <div className="release-card-cover">
                  {(t.personalCoverUrl || t.coverUrl) ? (
                    <img src={t.personalCoverUrl || t.coverUrl} alt="" />
                  ) : (
                    <span className="release-cover-fallback">
                      {t.title.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="release-card-body">
                  <div className="release-card-header">
                    <span className="release-card-title" title={t.title}>{t.title}</span>
                    {canEdit && (
                      <button
                        type="button"
                        className="at-delete release-card-delete"
                        title="РЈРґР°Р»РёС‚СЊ РєР°СЂС‚РѕС‡РєСѓ РїСЂРѕРµРєС‚Р° и РІСЃРµ РµС‘ РІРµСЂСЃРёРё"
                        disabled={deletingCardTrackId === t.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!window.confirm(`РЈРґР°Р»РёС‚СЊ РєР°СЂС‚РѕС‡РєСѓ РїСЂРѕРµРєС‚Р° «${t.title}» РІРјРµСЃС‚Рµ СЃРѕ РІСЃРµРјРё РІРµСЂСЃРёСЏРјРё (${versions.length})?`)) return;
                          setDeletingCardTrackId(t.id);
                          void (async () => {
                            for (const p of versions) {
                              if (isVirtualProject(p)) continue;
                              await onDelete(p.id);
                            }
                            // РЈР±РёСЂР°РµРј РІРёСЂС‚СѓР°Р»СЊРЅС‹Рµ РІРµСЂСЃРёРё (Р°СЂС…РёРІС‹, РїСЂРёРєСЂРµРїР»С‘РЅРЅС‹Рµ
                            // д С‚СЂРµРєСѓ РЅР°РїСЂСЏРјСѓСЋ), С‡С‚РѕР±С‹ РєР°СЂС‚РѕС‡РєР° РёСЃС‡РµР·Р»Р° СЃРѕРІСЃРµРј.
                            await onUpdateTrack(t.id, {
                              projectZips: [],
                              projectZipUrl: '',
                              projectZipStatus: undefined,
                              projectZipError: undefined,
                            });
                          })().finally(() => setDeletingCardTrackId(null));
                        }}
                      >
                        Г—
                      </button>
                    )}
                  </div>
                  <div className="release-card-artist">
                    {trackArtist || 'вЂ”'}
                  </div>
                  {t.project && (
                    <div className="release-card-meta">
                      <span className="beat-chip">РЎР±РѕСЂРЅРёРє: {t.project}</span>
                    </div>
                  )}

                  <div className="project-card-section-title">АрхивС‹ ({versions.length})</div>
                  {versions.length === 0 ? (
                    <div className="project-card-empty">
                      Р’РµСЂСЃРёР№ РїРѕРєР° Хет. РЎРѕР·РґР°Р№С‚Рµ РїРµСЂРІСѓСЋ, С‡С‚РѕР±С‹ СЃРІРѕРґРёС‚СЊ/РјР°СЃС‚РµСЂРёС‚СЊ СЌС‚РѕС‚ С‚СЂРµРє.
                    </div>
                  ) : (
                    <div className="release-versions">
                      {versions.map((p) => {
                        const variantLabel = p.variant ? PROJECT_VARIANT_LABELS[p.variant] : '';
                        const chips = [
                          p.vocalType ? PROJECT_VOCAL_TYPE_LABELS[p.vocalType] : '',
                          p.daw ? PROJECT_DAW_LABELS[p.daw] : '',
                          p.dawVersion ? `v${p.dawVersion}` : '',
                          p.stage ? PROJECT_STAGE_LABELS[p.stage] : '',
                        ].filter(Boolean);
                        return (
                          <div
                            className={`release-version ${canEdit && !isVirtualProject(p) ? 'release-version-clickable' : ''}`}
                            key={p.id}
                            title={canEdit && !isVirtualProject(p) ? 'РР·РјРµРЅРёС‚СЊ РІРµСЂСЃРёСЋ' : undefined}
                            onClick={(e) => {
                              if (!canEdit || isVirtualProject(p)) return;
                              // клид зе РєРЅРѕРїРєР°Рј/СЃСЃС‹Р»РєР°Рј РІРЅСѓС‚СЂРё Р±Р»РѕРєР° Хе РѕС‚РєСЂС‹РІР°РµС‚
                              // СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ и Хе РІСЃРїР»С‹РІР°РµС‚ РґРѕ РєР°СЂС‚РѕС‡РєРё С‚СЂРµРєР°.
                              // .project-zip Ц СЃРїРёСЃРєРµ вЂ” РѕР±СЏР·Р°С‚РµР»РµРЅ: РєРѕРіРґР° РєРЅРѕРїРєР°
                              // етйеХъ СѓР¶Рµ disabled, Р±СЂР°СѓР·РµСЂ Хе РѕС‚РїСЂР°РІР»СЏРµС‚ зе РЅРµР№
                              // click, и С†РµР»СЊСЋ СЃРѕР±С‹С‚РёСЏ СЃС‚Р°РЅРѕРІРёС‚СЃСЏ СЂРѕРґРёС‚РµР»СЊСЃРєРёР№ div.
                              // Р‘РµР· СЌС‚РѕР№ РїСЂРѕРІРµСЂРєРё РїРѕРІС‚РѕСЂРЅРѕРµ РЅР°Р¶Р°С‚РёРµ В«Г—В» РѕС‚РєСЂС‹РІР°Р»Рѕ
                              // СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ РІРµСЂСЃРёРё РІРјРµСЃС‚Рѕ етйеХъ Р·Р°РіСЂСѓР·РєРё.
                              if ((e.target as HTMLElement).closest('button, a, .project-zip')) {
                                e.stopPropagation();
                                return;
                              }
                              e.stopPropagation();
                              openEditVersion(p);
                            }}
                          >
                            <div className="release-version-head">
                              <span className="release-version-name" title={p.name}>{p.name}</span>
                              {canEdit && !isVirtualProject(p) && (
                                <div className="release-version-actions">
                                  <button
                                    type="button"
                                    className="at-delete"
                                    title="РЈРґР°Р»РёС‚СЊ РІРµСЂСЃРёСЋ"
                                    disabled={deletingId === p.id}
                                    onClick={() => {
                                      if (!window.confirm(`РЈРґР°Р»РёС‚СЊ РІРµСЂСЃРёСЋ «${p.name}»?`)) return;
                                      setDeletingId(p.id);
                                      void onDelete(p.id).finally(() => setDeletingId(null));
                                    }}
                                  >
                                    Г—
                                  </button>
                                </div>
                              )}
                            </div>
                            {(variantLabel || chips.length > 0) && (
                              <div className="release-version-chips">
                                {variantLabel && (
                                  <span
                                    className={`beat-chip project-variant-chip ${p.variant === 'main' ? 'project-variant-chip-main' : 'project-variant-chip-other'}`}
                                  >
                                    {variantLabel}
                                  </span>
                                )}
                                {chips.map((c) => <span className="beat-chip" key={c}>{c}</span>)}
                              </div>
                            )}
                            <div className="release-version-zip">
                              {renderZipSection(p)}
                              {!p.zipUrl && p.zipStatus !== 'uploading' && p.zipStatus !== 'error' && canEdit && !isVirtualProject(p) && (
                                <button
                                  type="button"
                                  className="btn-small-ghost"
                                  onClick={() => openEditVersion(p)}
                                >
                                  в¬† РџСЂРёРєСЂРµРїРёС‚СЊ Р°СЂС…РёРІ РІРµСЂСЃРёРё (.zip)
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {canEdit && (
                    <button
                      type="button"
                      className="btn-add-inline"
                      onClick={(e) => {
                        // ое РІСЃРїР»С‹РІР°РµРј РґРѕ РєР°СЂС‚РѕС‡РєРё, РёРЅР°С‡Рµ РѕС‚РєСЂРѕРµС‚СЃСЏ С‚СЂРµРє
                        e.stopPropagation();
                        openNewVersion(t);
                      }}
                    >
                      + РќРѕРІР°СЏ РІРµСЂСЃРёСЏ РїСЂРѕРµРєС‚Р° РґР»СЏ «{t.title}»
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="track-form-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{modal.editing ? 'Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ РІРµСЂСЃРёСЋ' : 'РќРѕРІР°СЏ РІРµСЂСЃРёСЏ РїСЂРѕРµРєС‚Р°'}</h2>
              <button className="modal-close" onClick={() => setModal(null)}>Г—</button>
            </div>

            <div className="form-section">
              <div className="form-group">
                <label>РќР°Р·РІР°РЅРёРµ РІРµСЂСЃРёРё</label>
                <input
                  type="text"
                  value={modal.name}
                  onChange={(e) => setModal({ ...modal, name: e.target.value })}
                  placeholder="РќР°Р·РІР°РЅРёРµ, РЅР°РїСЂРёРјРµСЂ: РЅР°Р·РІР°РЅРёРµ СЂРµР»РёР·Р° или В«РћСЃРЅРѕРІР°В»"
                />
              </div>

              <div className="form-group">
                <label>РўСЂРµРє, д РєРѕС‚РѕСЂРѕРјСѓ РїСЂРёРІСЏР·С‹РІР°РµС‚СЃСЏ РІРµСЂСЃРёСЏ РїСЂРѕРµРєС‚Р° *</label>
                <input
                  type="text"
                  value={trackSearch}
                  onChange={(e) => setTrackSearch(e.target.value)}
                  placeholder="РџРѕРёСЃРє С‚СЂРµРєР°: РЅР°Р·РІР°РЅРёРµ, Р°СЂС‚РёСЃС‚, СЃР±РѕСЂРЅРёРє, РЅРѕРјРµСЂвЂ¦"
                  style={{ marginBottom: 8 }}
                />
                <div className="release-multiselect">
                  {visibleTrackOptions.map((t) => {
                    const checked = modal.trackIds.includes(t.id);
                    const select = () => {
                      setModal({ ...modal, trackIds: checked ? [] : [t.id] });
                    };
                    return (
                      <label className="release-option" key={t.id}>
                        <input type="radio" checked={checked} onChange={select} />
                        <span className={`release-option-title ${checked ? 'checked' : ''}`}>
                          {t.trackNumber ? `${t.trackNumber}. ` : ''}{t.title}
                          {t.project ? <span className="beat-chip">СЃР±РѕСЂРЅРёРє: {t.project}</span> : null}
                        </span>
                      </label>
                    );
                  })}
                  {visibleTrackOptions.length === 0 && tracks.length > 0 && (
                    <div className="project-card-empty">
                      пе Р·Р°РїСЂРѕСЃСѓ «{trackSearch.trim()}» С‚СЂРµРєРё Хе РЅР°Р№РґРµРЅС‹.
                    </div>
                  )}
                  {tracks.length === 0 && (
                    <div className="project-card-empty">РЎРЅР°С‡Р°Р»Р° СЃРѕР·РґР°Р№С‚Рµ С…РѕС‚СЏ Р±С‹ РѕРґРёРЅ С‚СЂРµРє.</div>
                  )}
                </div>
                <div className="form-hint" style={{ marginTop: 4 }}>
                  РћРґРёРЅ РїСЂРѕРµРєС‚ (.zip) вЂ” РѕРґРёРЅ С‚СЂРµРє. РўСЂРµРє из СЃР±РѕСЂРЅРёРєР° теже РїСЂРёРІСЏР·С‹РІР°РµС‚СЃСЏ С‚РѕР»СЊРєРѕ СЃР°Рј д СЃРµР±Рµ.
                </div>
              </div>

              <h3>Р”РѕРї. РёРЅС„РѕСЂРјР°С†РёСЏ РїСЂРѕРµРєС‚Р°</h3>
              <div className="form-row">
                <div className="form-group">
                  <label>РЎС‚Р°С‚СѓСЃ</label>
                  <select
                    value={modal.status}
                    onChange={(e) => setModal({ ...modal, status: e.target.value as TrackStatus })}
                  >
                    {Object.entries(STATUS_LABELS).map(([id, label]) => (
                      <option key={id} value={id}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Р–Р°РЅСЂ</label>
                  <input
                    type="text"
                    value={modal.genre}
                    onChange={(e) => setModal({ ...modal, genre: e.target.value })}
                    placeholder="Hip-Hop"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>РђСЂС‚РёСЃС‚С‹ (С‡РµСЂРµР· Р·Р°РїСЏС‚СѓСЋ)</label>
                  <input
                    type="text"
                    value={modal.artists}
                    onChange={(e) => setModal({ ...modal, artists: e.target.value })}
                    placeholder="РћСЃРЅРѕРІРЅС‹Рµ РёСЃРїРѕР»РЅРёС‚РµР»Рё СЂРµР»РёР·Р°"
                  />
                </div>
                <div className="form-group">
                  <label>РўРµРіРё (С‡РµСЂРµР· Р·Р°РїСЏС‚СѓСЋ)</label>
                  <input
                    type="text"
                    value={modal.tags}
                    onChange={(e) => setModal({ ...modal, tags: e.target.value })}
                    placeholder="dark, деХцезт, Р°Р»СЊР±РѕРј"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>РћР±Р»РѕР¶РєР° (СЃСЃС‹Р»РєР°)</label>
                <input
                  type="url"
                  value={modal.coverUrl}
                  onChange={(e) => setModal({ ...modal, coverUrl: e.target.value })}
                  placeholder="https://вЂ¦/cover.jpg"
                />
              </div>
              <div className="form-group">
                <label>РћРїРёСЃР°РЅРёРµ</label>
                <textarea
                  value={modal.description}
                  onChange={(e) => setModal({ ...modal, description: e.target.value })}
                  placeholder="РџР°СЂР° СЃР»РѕРІ е СЂРµР»РёР·Рµ: Р·Р°РґР°С‡Р°, РёРґРµСЏ, РґРµС‚Р°Р»Рё"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Р’Р°СЂРёР°РЅС‚</label>
                  <select
                    value={modal.variant}
                    onChange={(e) => setModal({ ...modal, variant: e.target.value as ProjectVariant })}
                  >
                    <option value="main">{PROJECT_VARIANT_LABELS.main}</option>
                    <option value="other">{PROJECT_VARIANT_LABELS.other}</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Р’РѕРєР°Р» / РјР°С‚РµСЂРёР°Р»</label>
                  <select
                    value={modal.vocalType}
                    onChange={(e) => setModal({ ...modal, vocalType: e.target.value as ProjectVocalType | '' })}
                  >
                    <option value="">вЂ”</option>
                    {PROJECT_VOCAL_TYPES.map((v) => (
                      <option key={v} value={v}>{PROJECT_VOCAL_TYPE_LABELS[v]}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>DAW</label>
                  <select
                    value={modal.daw}
                    onChange={(e) => {
                      const daw = e.target.value as ProjectDaw;
                      setModal({
                        ...modal,
                        daw,
                        dawVersion: daw === 'fl' && !modal.dawVersion ? DEFAULT_DLD_VERSION : modal.dawVersion,
                      });
                    }}
                  >
                    <option value="fl">{PROJECT_DAW_LABELS.fl}</option>
                    <option value="trackout">{PROJECT_DAW_LABELS.trackout}</option>
                    <option value="other">{PROJECT_DAW_LABELS.other}</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Р’РµСЂСЃРёСЏ DAW</label>
                  <input
                    type="text"
                    value={modal.dawVersion}
                    onChange={(e) => setModal({ ...modal, dawVersion: e.target.value })}
                    placeholder={modal.daw === 'fl' ? DEFAULT_DLD_VERSION : 'РќР°РїСЂРёРјРµСЂ: 15, 21'}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Р­С‚Р°Рї</label>
                  <select
                    value={modal.stage}
                    onChange={(e) => setModal({ ...modal, stage: e.target.value as ProjectStage })}
                  >
                    {PROJECT_STAGES.map((s) => (
                      <option key={s} value={s}>{PROJECT_STAGE_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>РђСЂС…РёРІ РІРµСЂСЃРёРё (.zip, РґРѕ 1 Р“Р‘) вЂ” йежХе РїСЂРёРєСЂРµРїРёС‚СЊ зезже</label>
                <input
                  type="file"
                  accept=".zip"
                  onChange={(e) => setModal({ ...modal, zipFile: e.target.files?.[0] || null })}
                />
                {modal.zipFile && (
                  <div className="form-hint" style={{ marginTop: 4 }}>
                    РђСЂС…РёРІ «{modal.zipFile.name}» ({(modal.zipFile.size / 1024 / 1024).toFixed(1)} РњР‘)
                    Р±СѓРґРµС‚ Р·Р°РіСЂСѓР¶РµРЅ Ц С…СЂР°РЅРёР»РёС‰Рµ РїРѕСЃР»Рµ СЃРѕС…СЂР°РЅРµРЅРёСЏ.
                  </div>
                )}
              </div>

              <div className="form-hint">
                РћРґРЅР° Р·Р°РїРёСЃСЊ = РѕРґРЅР° РІРµСЂСЃРёСЏ. Р’РµСЂСЃРёРё йежХе РЅР°Р·РЅР°С‡Р°С‚СЊ СЃСЂР°Р·Сѓ РЅРµСЃРєРѕР»СЊРєРёРј СЂРµР»РёР·Р°Рј,
                С‡С‚РѕР±С‹ Хе РґСѓР±Р»РёСЂРѕРІР°С‚СЊ РѕРґРёРЅР°РєРѕРІСѓСЋ СЂР°Р±РѕС‚Сѓ Ц СЂР°Р·РЅС‹С… Р°Р»СЊР±РѕРјР°С….
              </div>
            </div>

            <div className="modal-footer">
              {modal.editing && (
                <span className="release-version-zip">
                  {renderZipSection(modal.editing)}
                </span>
              )}
              <button className="btn-secondary" onClick={() => setModal(null)}>РћС‚РјРµРЅР°</button>
              <button
                className="btn-primary"
                disabled={savingVersion}
                onClick={() => void saveVersion()}
              >
                {savingVersion ? 'РЎРѕС…СЂР°РЅСЏРµРјвЂ¦' : modal.editing ? 'РЎРѕС…СЂР°РЅРёС‚СЊ' : 'РЎРѕР·РґР°С‚СЊ РІРµСЂСЃРёСЋ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}