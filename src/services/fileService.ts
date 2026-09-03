const MAX_DIM = 800;
const JPEG_QUALITY = 0.82;
const MAX_BYTES_APPROX = 650 * 1024; // оставляем запас под 1 МБ лимит документа

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не удалось загрузить изображение'));
    img.src = src;
  });
}

function compressToDataUrl(img: HTMLImageElement, maxDim: number, quality: number): string {
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Сжимает изображение и возвращает data URL (JPEG) для хранения прямо в Firestore.
 * Без Cloud Storage — работает на бесплатном плане.
 */
export async function compressCover(file: File): Promise<string> {
  const fileSizeMB = file.size / (1024 * 1024);
  if (fileSizeMB > 10) {
    throw new Error('Файл слишком большой (более 10 МБ). Выбери другое изображение.');
  }

  const src = await fileToDataUrl(file);
  const img = await loadImage(src);

  let maxDim = MAX_DIM;
  let quality = JPEG_QUALITY;
  let result = compressToDataUrl(img, maxDim, quality);

  // Если всё ещё слишком большой — снижаем качество, затем и разрешение
  let iterative = 0;
  while (result.length > MAX_BYTES_APPROX && iterative < 5) {
    if (quality > 0.45) {
      quality = Math.max(0.4, quality - 0.15);
    } else {
      maxDim = Math.max(240, Math.round(maxDim * 0.6));
    }
    result = compressToDataUrl(img, maxDim, quality);
    iterative++;
  }
  return result;
}

export async function uploadCover(file: File): Promise<string> {
  return compressCover(file);
}

export async function deleteCover() {}
