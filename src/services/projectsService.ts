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
import type { Project } from '../types/track';

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
  return data;
}

function cleanForFirestore(data: any): Record<string, any> {
  const s = sanitize(data);
  return (s && typeof s === 'object' ? s : {}) as Record<string, any>;
}

export function subscribeToProjects(
  callback: (projects: Project[]) => void,
  onError?: (e: Error) => void
) {
  const q = query(projectsRef, orderBy('updatedAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const projects = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Project));
    callback(projects);
  }, onError);
}

export async function createProject(data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const now = new Date().toISOString();
  const docRef = await addDoc(projectsRef, cleanForFirestore({
    ...data,
    createdAt: now,
    updatedAt: now,
  }));
  return docRef.id;
}

export async function updateProject(id: string, data: Partial<Project>) {
  const ref = doc(db, 'projects', id);
  await updateDoc(ref, cleanForFirestore({
    ...data,
    updatedAt: new Date().toISOString(),
  }));
}

export async function deleteProject(id: string) {
  await deleteDoc(doc(db, 'projects', id));
}