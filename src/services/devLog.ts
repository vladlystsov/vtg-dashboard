export interface DevLogEntry {
  id: number;
  op?: string;
  url: string;
  status?: number;
  ok?: boolean;
  error?: string;
  at: number;
}

let entries: DevLogEntry[] = [];
let seq = 0;
const listeners = new Set<() => void>();

export function pushDevLog(entry: Omit<DevLogEntry, 'id' | 'at'>): void {
  entries = [...entries.slice(-49), { ...entry, id: ++seq, at: Date.now() }];
  for (const listener of listeners) listener();
}

export function clearDevLogs(): void {
  entries = [];
  for (const listener of listeners) listener();
}

export function subscribeDevLogs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDevLogs(): DevLogEntry[] {
  return entries;
}
