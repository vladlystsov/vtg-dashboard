import { describe, expect, it, vi } from 'vitest';

// b2StorageService тянет Firebase ради токена, а здесь проверяется только
// переписывание ссылок — инициализация клиента не нужна.
vi.mock('../config/firebase', () => ({ auth: {} }));

import { resolveStorageUrl, resolveStorageUrls } from '../services/b2StorageService';
import { normalizeTrack } from '../utils/normalizeTrack';

const OLD_PROXY = 'https://old-proxy.example.com/api/b2-storage';

describe('resolveStorageUrl', () => {
  // Ссылки загруженных файлов лежат в Firestore абсолютными. После переезда
  // прокси на новый домен старые записи иначе ходили бы на прежний адрес.
  it('переносит путь со старого прокси на актуальный', () => {
    const out = resolveStorageUrl(`${OLD_PROXY}?path=tracks%2Fa.mp3`);
    expect(out).toContain('?path=tracks%2Fa.mp3');
    expect(out).not.toContain('old-proxy.example.com');
    expect(out.startsWith('https://')).toBe(true);
  });

  it('не трогает ссылки не из хранилища', () => {
    const soundcloud = 'https://soundcloud.com/artist/track?si=abc';
    expect(resolveStorageUrl(soundcloud)).toBe(soundcloud);
    const b2 = 'https://f005.backblazeb2.com/file/bucket/tracks/a.mp3';
    expect(resolveStorageUrl(b2)).toBe(b2);
  });

  it('пустая ссылка остаётся пустой', () => {
    expect(resolveStorageUrl(undefined)).toBe('');
    expect(resolveStorageUrl(null)).toBe('');
    expect(resolveStorageUrl('   ')).toBe('');
  });
});

describe('resolveStorageUrls', () => {
  it('переписывает только строковые поля из списка', () => {
    const item = {
      id: '1',
      name: 'Проект',
      zipUrl: `${OLD_PROXY}?path=projects%2Fa.zip`,
      coverUrl: null as string | null,
    };
    const out = resolveStorageUrls(item, ['zipUrl', 'coverUrl']);

    expect(out.zipUrl).toContain('?path=projects%2Fa.zip');
    expect(out.zipUrl).not.toContain('old-proxy.example.com');
    expect(out.coverUrl).toBeNull();
    expect(out.name).toBe('Проект');
    expect(out.id).toBe('1');
  });
});

describe('normalizeTrack', () => {
  it('переписывает ссылки на файлы, включая projectZips', () => {
    const track = normalizeTrack({
      id: 't1',
      title: 'Трек',
      projectZipUrl: `${OLD_PROXY}?path=legacy.zip`,
      coverUrl: `${OLD_PROXY}?path=cover%2Fa.jpg`,
      platformUrl: 'https://soundcloud.com/artist/track',
      projectZips: [
        { projectId: 'p1', projectName: 'v1', zipUrl: `${OLD_PROXY}?path=p1.zip`, uploadedAt: '' },
      ],
    });

    expect(track.projectZipUrl).toContain('?path=legacy.zip');
    expect(track.projectZipUrl).not.toContain('old-proxy.example.com');
    expect(track.coverUrl).toContain('?path=cover%2Fa.jpg');
    expect(track.coverUrl).not.toContain('old-proxy.example.com');
    expect(track.platformUrl).toBe('https://soundcloud.com/artist/track');
    expect(track.projectZips?.[0].zipUrl).toContain('?path=p1.zip');
    expect(track.projectZips?.[0].zipUrl).not.toContain('old-proxy.example.com');
  });
});
