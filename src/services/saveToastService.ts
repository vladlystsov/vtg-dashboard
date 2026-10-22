/**
 * Состояние всплывающего уведомления о сохранённом файле.
 *
 * Храним вне React: уведомление не должно исчезать, если список перерисовался
 * и кнопка скачивания размонтировалась. Компонент `<SaveToast />` подписан
 * на это состояние.
 */

export interface SaveToastAction {
  label: string;
  run: () => void | Promise<void>;
}

export interface SaveToastState {
  title: string;
  subtitle?: string;
  actions: SaveToastAction[];
}

let state: SaveToastState | null = null;
const listeners = new Set<() => void>();

export function showSaveToast(next: SaveToastState | null): void {
  state = next;
  for (const listener of listeners) listener();
}

export function subscribeSaveToast(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSaveToast(): SaveToastState | null {
  return state;
}
