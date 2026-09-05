import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { SoundProject, ProjectFile } from '../types/track';
import { v4 as uuidv4 } from 'uuid';

const projectsRef = collection(db, 'projects');

function sanitize(data: any): any {
  if (data === undefined || data === null) return undefined;
  if (Array.isArray(data)) {
    const out: any[] = [];
    for (const v of data) {
      const s = sanitize(v);
      if (s !== undefined) out.push(s);
    }
    return out;
  }
  if (typeof data === 'object') {
    const clean: Record<string, any> = {};
    for (const k of Object.keys(data)) {
      const s = sanitize((data as Record<string, any>)[k]);
      if (s !== undefined) clean[k] = s;
    }
    return clean;
  }
  if (data === undefined || data === null) return undefined;
  return data;
}

function cleanForFirestore(data: any): Record<string, any> {
  const s = sanitize(data);
  return (s && typeof s === 'object' ? s : {}) as Record<string, any>;
}

export function subscribeToProjects(
  callback: (projects: SoundProject[]) => void,
  onError?: (e: Error) => void
) {
  const q = query(projectsRef, orderBy('updatedAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const projects = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as SoundProject));
    callback(projects);
  }, onError);
}

export async function createProject(data: {
  name: string;
  description: string;
  beatmakerUid: string;
  beatmakerName: string;
  coverUrl?: string;
}): Promise<string> {
  const now = new Date().toISOString();
  const docRef = await addDoc(projectsRef, cleanForFirestore({
    ...data,
    files: [],
    createdAt: now,
    updatedAt: now,
  }));
  return docRef.id;
}

export async function updateProject(id: string, data: Partial<SoundProject>) {
  const ref = doc(db, 'projects', id);
  await updateDoc(ref, cleanForFirestore({
    ...data,
    updatedAt: new Date().toISOString(),
  }));
}

export async function deleteProject(id: string) {
  await deleteDoc(doc(db, 'projects', id));
}

export async function addFileToProject(
  projectId: string,
  file: { name: string; url: string; type: string; size: number },
  existingFiles: ProjectFile[]
): Promise<void> {
  const newFile: ProjectFile = {
    id: uuidv4(),
    ...file,
    uploadedAt: new Date().toISOString(),
  };
  const ref = doc(db, 'projects', projectId);
  await updateDoc(ref, cleanForFirestore({
    files: [...existingFiles, newFile],
    updatedAt: new Date().toISOString(),
  }));
}

export async function removeFileFromProject(
  projectId: string,
  fileId: string,
  existingFiles: ProjectFile[]
): Promise<void> {
  const ref = doc(db, 'projects', projectId);
  await updateDoc(ref, cleanForFirestore({
    files: existingFiles.filter((f) => f.id !== fileId),
    updatedAt: new Date().toISOString(),
  }));
}
