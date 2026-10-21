import type { WorkspaceData } from './data';
import { kernelKey } from './data';
import type { Dict } from './i18n';
import { Modal, Progress, percent } from './ui';

// Engine versions for this computer, which profiles use them, and downloads.
export function EnginesDialog({ d, data, onClose }: { d: Dict; data: WorkspaceData; onClose(): void }){
  const E = d.engines;
  const used = new Map<string, number>();
  for (const p of data.profiles ?? []) used.set(kernelKey(p.kernel, p.kernelVersion), (used.get(kernelKey(p.kernel, p.kernelVersion)) ?? 0) + 1);
  return (
    <Modal title={E.title} closeLabel={d.common.close} onClose={onClose} foot={<button className="btn btn-ghost" type="button" onClick={onClose}>{d.common.close}</button>}>
      <div className="m-body">
        <p className="muted">{E.lead}</p>
        <ul className="engines">
          {data.kernels.map((k, i) => {
            const key = kernelKey(k.kind, k.version), pr = data.progress[key];
            const first = data.kernels.findIndex(x => x.kind === k.kind) === i;
            const downloading = pr && !pr.finished && !pr.error;
            return (
              <li key={key} data-kernel={key}>
                <div>
                  <b>{k.kind === 'chromium' ? 'Chromium' : 'Firefox'} {k.version}</b>
                  <p className="hint">{[first && E.recommended, E.usedBy(used.get(key) ?? 0)].filter(Boolean).join(' · ')}</p>
                  {downloading && <><Progress done={pr.done} total={pr.total} /><p className="hint">{d.form.downloading(percent(pr))}</p></>}
                  {pr?.error && <p className="err">{E.failed}</p>}
                </div>
                {k.installed
                  ? <span className="pill-ok">{E.installed}</span>
                  : !downloading && <button className="btn btn-line btn-sm" type="button" onClick={() => void data.install(k.kind, k.version)}>{E.download(k.sizeHint)}</button>}
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}
