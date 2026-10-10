import { GripVertical, Lock } from 'lucide-react';
import { TABS } from '../../data/tabs.js';
import { useDragSort } from '../../hooks/useDragSort.js';
import { useSettings } from '../../hooks/useSettings.js';
import { Group, Hint, Page, Preview, Switch } from './controls.jsx';

/** The bar as it will stand: your tabs either side of the beat. */
export function TabsPreview() {
  const { settings } = useSettings();
  const shown = (settings.tabs ?? Object.keys(TABS)).filter((id) => TABS[id] && (id === 'home' || !(settings.hiddenTabs ?? []).includes(id)));
  const half = Math.ceil(shown.length / 2);
  const side = (ids) => (
    <div className="flex flex-1 items-start justify-evenly">
      {ids.map((id) => {
        const { Icon, label } = TABS[id];
        return (
          <span key={id} className={`flex flex-col items-center gap-1 ${id === 'home' ? 'text-moon' : 'text-moon/55'}`}>
            <Icon className="h-[0.95rem] w-[0.95rem]" strokeWidth={1.8} />
            <span className="max-w-[3.6rem] truncate text-[0.5625rem] leading-none">{label.split(' ')[0]}</span>
          </span>
        );
      })}
    </div>
  );

  return (
    <Preview>
      <div className="preview-ground top-[46%]" />
      <div className="absolute inset-x-0 bottom-0 h-[42%]">
        <svg viewBox="0 0 240 30" preserveAspectRatio="none" className="absolute inset-x-0 top-1 h-7 w-full" fill="none">
          <path d="M0 9 H104 M136 9 H240" stroke="rgba(238,240,250,0.2)" strokeWidth="0.9" vectorEffect="non-scaling-stroke" />
          <path
            d="M104 9 L109 5 L113 14 L119 0.5 L125 11 L129 9 H136"
            style={{ stroke: 'var(--accent)' }}
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="absolute inset-x-3 top-5 flex items-start">
          {side(shown.slice(0, half))}
          <span className="display-type w-[4.5rem] shrink-0 pt-3 text-center text-[0.6875rem] italic text-moon/80">Ask Pulse</span>
          {side(shown.slice(half))}
        </div>
      </div>
      <p className="t-label absolute left-5 top-4 text-[0.75rem]">Your tab bar</p>
      <p className="display-type absolute left-5 top-9 text-[1.75rem] leading-none text-moon">
        {shown.length} {shown.length === 1 ? 'tab' : 'tabs'}
      </p>
    </Preview>
  );
}

export function TabsPane() {
  const { settings, update } = useSettings();
  const order = (settings.tabs ?? Object.keys(TABS)).filter((id) => TABS[id]);
  const hidden = settings.hiddenTabs ?? [];

  const sort = useDragSort({
    count: order.length,
    onReorder: (from, to) =>
      update((s) => {
        const next = [...(s.tabs ?? order)];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        return { tabs: next };
      }),
  });

  const toggle = (id, on) =>
    update((s) => {
      const list = s.hiddenTabs ?? [];
      return { hiddenTabs: on ? list.filter((t) => t !== id) : [...new Set([...list, id])] };
    });

  return (
    <Page>
      <Group
        title="Your tabs"
        note="Drag them into the order you reach for them. The first half sit left of Ask Pulse, the rest to its right."
      >
        <div className="[&>*+*]:border-t [&>*+*]:border-white/[0.06]">
          {order.map((id, i) => {
            const { Icon, label } = TABS[id];
            const on = id === 'home' || !hidden.includes(id);
            return (
              <div
                key={id}
                {...sort.itemProps(i)}
                className={`settings-row relative cursor-grab touch-none select-none active:cursor-grabbing ${
                  sort.dragging === i ? 'z-10 rounded-[1rem] bg-[#151b31] shadow-[0_18px_40px_-16px_rgba(0,0,0,0.85)]' : ''
                }`}
              >
                <GripVertical className="h-4 w-4 shrink-0 text-moon/30" aria-hidden="true" />
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-[0.6rem] bg-white/[0.06] ${on ? 'text-moon' : 'text-moon/35'}`}>
                  <Icon className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`settings-row-label ${on ? '' : '!text-moon/45'}`}>{label}</span>
                  {id === 'home' ? <span className="settings-row-hint">Always here — Settings is reached from it.</span> : null}
                </span>
                {id === 'home' ? (
                  <Lock className="mr-3 h-4 w-4 text-moon/30" aria-label="Always shown" />
                ) : (
                  <span onPointerDown={(e) => e.stopPropagation()}>
                    <Switch checked={on} onChange={(v) => toggle(id, v)} label={`Show ${label}`} />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </Group>
      <Hint className="mt-4">
        A tab you put away is still there when you ask for it — “open Travel” takes you straight to it.
      </Hint>
    </Page>
  );
}
