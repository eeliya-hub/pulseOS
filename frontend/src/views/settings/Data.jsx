import { Download, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { describe, download, restore, storedSummary } from '../../services/backup.js';
import { Group, Page, Preview, Row } from './controls.jsx';

const size = (bytes) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

// One colour a store in the preview's bar, in the order the stores are listed.
const BAR = ['var(--accent)', '#9ff0d0', '#ffd27a', '#ff9ec4', '#a5b4ff', '#ffb08a', '#7fd8f0', '#d4b4ff'];

/** What this copy of Pulse keeps, as one bar split by store. */
export function DataPreview() {
  const stores = useMemo(() => storedSummary(), []);
  const total = stores.reduce((n, s) => n + s.bytes, 0) || 1;
  return (
    <Preview>
      <p className="t-label absolute left-5 top-4 text-[0.75rem]">Kept on this machine</p>
      <p className="display-type absolute left-5 top-9 text-[1.75rem] leading-none text-moon">{size(total)}</p>
      <p className="t-micro absolute left-5 top-[4.6rem]">In {stores.length} places, all in this browser</p>
      <div className="absolute inset-x-5 bottom-5">
        <div className="flex h-2 overflow-hidden rounded-full bg-white/[0.06]">
          {stores.map((s, i) => (
            <span key={s.key} className="h-full" style={{ width: `${(s.bytes / total) * 100}%`, background: BAR[i % BAR.length], opacity: s.carried ? 0.9 : 0.35 }} />
          ))}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
          {stores.slice(0, 4).map((s, i) => (
            <span key={s.key} className="flex items-center gap-1.5 text-[0.625rem] text-moon/60">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: BAR[i % BAR.length] }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>
    </Preview>
  );
}

/**
 * What Pulse keeps, and how to carry it to another copy. A browser keeps this
 * per address, and the desktop app lives at a different one to the dev server,
 * so the two never share it on their own — hence a file.
 */
export function DataPane() {
  const [note, setNote] = useState(null);
  const file = useRef(null);
  const stores = useMemo(() => storedSummary(), [note]); // eslint-disable-line react-hooks/exhaustive-deps
  const largest = stores[0]?.bytes || 1;

  const save = () => {
    const parts = describe(download());
    setNote({ tone: 'ok', text: parts.length ? `Saved ${parts.join(', ').toLowerCase()}.` : 'Saved, though there was little to save.' });
  };

  const load = async (chosen) => {
    if (!chosen) return;
    try {
      const restored = await restore(chosen);
      setNote({ tone: 'ok', text: `Restored ${restored.length ? restored.join(', ').toLowerCase() : 'your backup'}. Reloading…` });
      // Every store reads its key once, at launch, so the page has to come back.
      window.setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      setNote({ tone: 'bad', text: e.message });
    }
  };

  return (
    <Page>
      <Group
        title="Carry it over"
        note="One file with your trips, to-dos, habits, launchpad, folders, conversations, your background and every setting here. Connected accounts stay behind on purpose — a copy of them would be a copy of a password."
      >
        <Row label="Export a backup" hint="Saved to your Downloads as one .json file.">
          <button type="button" onClick={save} className="pill pill-lit h-9 px-4">
            <Download className="h-4 w-4" aria-hidden="true" />
            Export
          </button>
        </Row>
        <Row label="Import a backup" hint="Adds to what’s here and replaces anything it also has. Nothing it doesn’t mention is touched.">
          <button type="button" onClick={() => file.current?.click()} className="pill h-9 px-4">
            <Upload className="h-4 w-4" aria-hidden="true" />
            Import
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              load(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </Row>
        {note ? <p className={`px-5 py-4 text-[0.875rem] ${note.tone === 'bad' ? 'text-fall' : 'text-rise'}`}>{note.text}</p> : null}
      </Group>

      <Group title="On this machine" note="Everything Pulse keeps, largest first.">
        {stores.map((s) => (
          <div key={s.key} className="px-5 py-3.5">
            <span className="flex items-baseline justify-between gap-4">
              <span className="settings-row-label truncate">{s.label}</span>
              <span className="t-meta clock-figures shrink-0">{size(s.bytes)}</span>
            </span>
            <span className="mt-2 block h-[3px] overflow-hidden rounded-full bg-white/[0.05]">
              <span
                className="bar-grow block h-full rounded-full"
                style={{
                  width: `${Math.max(2, (s.bytes / largest) * 100)}%`,
                  background: s.carried
                    ? 'linear-gradient(90deg, color-mix(in srgb, var(--accent) 35%, transparent), var(--accent))'
                    : 'rgba(255,255,255,0.18)',
                }}
              />
            </span>
            {!s.carried ? <span className="t-micro mt-1.5 block">Rebuilt on its own — not in the export</span> : null}
          </div>
        ))}
      </Group>
    </Page>
  );
}
