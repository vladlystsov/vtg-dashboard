/**
 * Модуль для управления контроллерами отмены загрузки треков/битов.
 * Позволяет связать App.tsx (где запускается загрузка) и компоненты отображения (где нажимают отмену).
 */

const uploadControllers = new Map<string, AbortController>();

/** Зарегистрировать контроллер отмены для загрузки по ID трека/бита */
export function registerUploadController(id: string, controller: AbortController): void {
  // Если предыдущий контроллер ещё активен, отменяем его
  const prev = uploadControllers.get(id);
  if (prev && !prev.signal.aborted) {
    prev.abort();
  }
  uploadControllers.set(id, controller);
}

/** Отменить загрузку по ID трека/бита */
export function cancelUploadById(id: string): boolean {
  const controller = uploadControllers.get(id);
  if (controller && !controller.signal.aborted) {
    controller.abort();
    uploadControllers.delete(id);
    return true;
  }
  return false;
}

/** Удалить контроллер (после завершения загрузки) */
export function clearUploadController(id: string): void {
  uploadControllers.delete(id);
}

/** Получить сигнал отмены по ID (для передачи в publishBeatAudioInBackground) */
export function getUploadSignal(id: string): AbortSignal | undefined {
  return uploadControllers.get(id)?.signal;
}
