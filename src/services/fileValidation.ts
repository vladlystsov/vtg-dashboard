const ALLOWED_EXT = ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus'];
const MAX_BYTES = 30 * 1024 * 1024;
const MAX_PROJECT_ZIP_BYTES = 1024 * 1024 * 1024; // 1 GB

export function isBeatAudioFile(file: File): boolean {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return ALLOWED_EXT.includes(ext) && (file.type.startsWith('audio/') || file.type === '');
}

export function checkBeatAudioFile(file: File): string | null {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) return `Формат .${ext} не поддерживается (mp3/wav/ogg/m4a/aac/flac/opus)`;
  if (file.size > MAX_BYTES) return 'Файл больше 30 МБ';
  return null;
}

export function checkProjectZipFile(file: File): string | null {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext !== 'zip') return 'Формат .' + ext + ' не поддерживается, нужен .zip архив';
  if (file.size > MAX_PROJECT_ZIP_BYTES) return 'Архив больше 1 ГБ (максимум 1 ГБ)';
  if (file.size <= 0) return 'Пустой архив';
  return null;
}