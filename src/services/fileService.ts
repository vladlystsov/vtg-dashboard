import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../config/firebase';

function withTimeout<T>(p: Promise<T>, ms = 20000, msg: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(msg)), ms)
    ),
  ]);
}

export async function uploadCover(file: File, trackId: string): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `covers/${trackId}.${ext}`;
  const storageRef = ref(storage, path);

  try {
    await withTimeout(
      uploadBytes(storageRef, file),
      20000,
      'Таймаут загрузки обложки. Проверь, что Cloud Storage включён в Firebase.'
    );
  } catch (e: any) {
    if (e?.code === 'storage/unauthorized' || e?.message?.includes('permission')) {
      throw new Error('Обложка: нет прав на запись в Storage. Добавь Storage Rules на covers/.');
    }
    if (e?.code === 'storage/invalid-root-operation' || e?.message?.includes('bucket')) {
      throw new Error('Обложка: Storage не настроен. Включи Cloud Storage и укажи storageBucket в конфиге.');
    }
    throw e;
  }

  return getDownloadURL(storageRef);
}

export async function deleteCover(url: string) {
  try {
    const storageRef = ref(storage, url);
    await deleteObject(storageRef);
  } catch {
    // ignore
  }
}
