import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { EduProject } from '../types/eduProject';

const eduProjectsRef = collection(db, 'eduProjects');

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

export function subscribeToEduProjects(
  callback: (projects: EduProject[]) => void,
  onError?: (e: Error) => void
) {
  const q = query(eduProjectsRef, orderBy('updatedAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const projects = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as EduProject));
    callback(projects);
  }, (err) => {
    console.error('[EduProjects] Ошибка подписки:', err);
    onError?.(err);
  });
}

export async function createEduProject(data: Omit<EduProject, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const now = new Date().toISOString();
  const docRef = await addDoc(eduProjectsRef, cleanForFirestore({
    ...data,
    createdAt: now,
    updatedAt: now,
  }));
  return docRef.id;
}

export async function updateEduProject(id: string, data: Partial<EduProject>) {
  const ref = doc(db, 'eduProjects', id);
  await updateDoc(ref, cleanForFirestore({
    ...data,
    updatedAt: new Date().toISOString(),
  }));
}

export async function deleteEduProject(id: string) {
  await deleteDoc(doc(db, 'eduProjects', id));
}

// Массовый импорт: создаёт записи из массива данных (для заглушек и выгрузки)
export async function bulkImportEduProjects(rows: Omit<EduProject, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<number> {
  let created = 0;
  for (const r of rows) {
    await createEduProject(r);
    created += 1;
  }
  return created;
}