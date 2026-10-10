import { FolderPlus, RefreshCw, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import LaunchIcon, { BrowserBadge } from '../../components/LaunchIcon.jsx';
import LaunchpadSettings from '../../components/LaunchpadSettings.jsx';
import { useInstalledApps } from '../../hooks/useInstalledApps.js';
import { useLaunchpadMeta } from '../../hooks/useLaunchpadMeta.js';
import { useSettings } from '../../hooks/useSettings.js';
import { isSite, itemKey, itemLabel } from '../../services/launchpad/items.js';
import { Empty, Group, Page, Preview, Row, Select } from './controls.jsx';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The shelf's first few, as they sit on the Launchpad. */
export function LaunchpadPreview() {
  const { settings } = useSettings();
  const items = settings.launchpad ?? [];
  const sites = items.filter(isSite).length;
  return (
    <Preview>
      <p className="t-label absolute left-5 top-4 text-[0.75rem]">On the launchpad</p>
      <p className="display-type absolute left-5 top-9 text-[1.75rem] leading-none text-moon">{plural(items.length, 'thing')}</p>
      <p className="t-micro absolute left-5 top-[4.6rem]">
        {plural(items.length - sites, 'app')} and {plural(sites, 'site')}
      </p>
      <div className="absolute bottom-4 right-4 grid grid-cols-4 gap-2">
        {items.slice(0, 8).map((item) => (
          <span key={itemKey(item)} className="relative block h-9 w-9">
            <LaunchIcon item={item} className="h-full w-full" />
          </span>
        ))}
      </div>
    </Preview>
  );
}

/**
 * The launchpad from Settings: the shelf as it stands, the editor a press away,
 * and the things about it that aren't any one tile — its folders, the app on
 * its highlight card, and what this Mac has installed.
 */
export function LaunchpadPane({ onModal }) {
  const { settings, update } = useSettings();
  const items = useMemo(() => settings.launchpad ?? [], [settings.launchpad]);
  const meta = useLaunchpadMeta();
  const { apps: installed, refresh } = useInstalledApps();
  const [editing, setEditing] = useState(false);
  const [folder, setFolder] = useState('');
  const [looking, setLooking] = useState(false);

  const open = (value) => {
    setEditing(value);
    onModal?.(value);
  };

  const counts = useMemo(() => {
    const out = {};
    for (const f of Object.values(meta.folderOf ?? {})) if (f) out[f] = (out[f] ?? 0) + 1;
    return out;
  }, [meta.folderOf]);

  const highlighted = items.find((i) => itemKey(i) === meta.highlighted);

  return (
    <Page>
      <Group
        title="Your launchpad"
        note="Add and remove things, and dress any of them — its icon, its name, its background, the browser a site opens in."
        action={
          <button type="button" onClick={() => open(true)} className="pill pill-lit h-9 px-4">
            Edit the launchpad
          </button>
        }
        pad
      >
        {items.length === 0 ? (
          <p className="py-2 text-[0.9375rem] text-dim">Nothing on it yet.</p>
        ) : (
          <div className="cascade grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-1">
            {items.map((item) => (
              <button
                key={itemKey(item)}
                type="button"
                onClick={() => open(true)}
                title={`Edit ${itemLabel(item)}`}
                className="group flex min-w-0 flex-col items-center gap-2 rounded-2xl px-1 py-3 transition hover:bg-white/[0.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                <span className="relative block h-12 w-12 transition-transform duration-300 group-hover:-translate-y-0.5">
                  <LaunchIcon item={item} className="h-full w-full" />
                  <BrowserBadge item={item} />
                </span>
                <span className="w-full truncate text-center text-[0.75rem] text-haze group-hover:text-moon">{itemLabel(item)}</span>
              </button>
            ))}
          </div>
        )}
      </Group>

      <Group title="Folders" note="Removing a folder keeps everything that was in it. File things into one while arranging the Launchpad.">
        {meta.folders.length === 0 ? (
          <Empty>No folders yet.</Empty>
        ) : (
          meta.folders.map((name) => (
            <Row key={name} label={name} hint={`${plural(counts[name] ?? 0, 'thing')} in it`}>
              <button
                type="button"
                onClick={() => meta.removeFolder(name)}
                aria-label={`Remove the ${name} folder`}
                className="pill h-8 w-8 px-0 text-moon/60 hover:text-fall"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </Row>
          ))
        )}
        <form
          className="settings-row"
          onSubmit={(e) => {
            e.preventDefault();
            meta.addFolder(folder);
            setFolder('');
          }}
        >
          <FolderPlus className="h-4 w-4 shrink-0 text-moon/45" strokeWidth={1.7} aria-hidden="true" />
          <input
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            maxLength={18}
            placeholder="A new folder"
            aria-label="New folder name"
            className="min-w-0 flex-1 bg-transparent text-[0.9688rem] text-moon outline-none placeholder:text-moon/35"
          />
          <button type="submit" disabled={!folder.trim()} className="pill h-9 px-4 disabled:opacity-40">
            Add
          </button>
        </form>
      </Group>

      <Group title="Highlight card">
        <Row label="The app it shows" hint="The large card at the top of the Launchpad.">
          <Select
            label="App on the highlight card"
            value={highlighted ? itemKey(highlighted) : ''}
            onChange={(key) => {
              const item = items.find((i) => itemKey(i) === key);
              if (!item) {
                if (meta.highlighted) meta.toggleHighlight(null);
              } else if (key !== meta.highlighted) meta.toggleHighlight(item);
            }}
            options={[{ id: '', label: 'Nothing highlighted' }, ...items.map((i) => ({ id: itemKey(i), label: itemLabel(i) }))]}
          />
        </Row>
      </Group>

      <Group title="On this Mac">
        <Row
          label={`${installed.length} applications found`}
          hint="From /Applications and the web apps your browsers installed. Pulse looks again whenever you come back to it."
        >
          <button
            type="button"
            onClick={() => {
              setLooking(true);
              refresh().finally(() => setLooking(false));
            }}
            className="pill h-9 px-4"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${looking ? 'animate-spin' : ''}`} aria-hidden="true" />
            Look again
          </button>
        </Row>
      </Group>

      {editing ? (
        <LaunchpadSettings
          selected={items}
          installed={installed}
          meta={meta}
          onChange={(next) => update({ launchpad: next })}
          onClose={() => open(false)}
        />
      ) : null}
    </Page>
  );
}
