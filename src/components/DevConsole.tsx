import { useEffect, useState } from 'react';
import { clearDevLogs, getDevLogs, subscribeDevLogs, type DevLogEntry } from '../services/devLog';

export function DevConsole() {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<DevLogEntry[]>(getDevLogs());

  useEffect(() => subscribeDevLogs(() => setLogs([...getDevLogs()])), []);

  return (
    <>
      <button type="button" className="dev-fab" onClick={() => setOpen((v) => !v)} aria-label="Dev console">
        ⌨
      </button>
      {open ? (
        <div className="dev-panel">
          <div className="dev-panel__head">
            <span>Dev console</span>
            <span className="dev-panel__actions">
              <button type="button" onClick={() => clearDevLogs()}>
                clear
              </button>
              <button type="button" onClick={() => setOpen(false)}>
                close
              </button>
            </span>
          </div>
          <div className="dev-panel__body">
            {logs.length === 0 ? (
              <div className="dev-panel__empty">no logs yet</div>
            ) : (
              logs.map((l) => (
                <div key={l.id} className="dev-log">
                  <span className="dev-log__time">{new Date(l.at).toLocaleTimeString()}</span>
                  <span className="dev-log__op">{l.op || '—'}</span>
                  <span className="dev-log__status">{l.status ? `HTTP ${l.status}` : l.error || '—'}</span>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
