import {
  CalendarRange,
  ChevronDown,
  KanbanSquare,
  Plus,
  Search,
  Settings2,
  Table2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ground, SkyZone } from '../components/Stage.jsx';
import { useProjects } from '../hooks/useProjects.js';
import { colourOf, dayKey, filterCards, projectProgress } from '../services/projects/board.js';
import ProjectBoard from './projects/Board.jsx';
import CardDetail from './projects/CardDetail.jsx';
import ProjectSettings from './projects/ProjectSettings.jsx';
import ProjectTable from './projects/Table.jsx';
import ProjectTimeline from './projects/Timeline.jsx';

/**
 * Projects, as boards.
 *
 * The same frame as every other view — a sky saying which board you are on and
 * how far through it you are, and a ground you work in. What changes is the
 * ground: the same set of cards drawn as lanes, as a timeline, or as a table,
 * because those are three questions about one thing (what is in flight, when it
 * lands, what the whole lot looks like at once) rather than three features.
 *
 * Everything is yours and local. There is no board to share and nobody to
 * assign to, which is the one thing here that is deliberately not Trello.
 */

const VIEWS = [
  { id: 'board', label: 'Board', Icon: KanbanSquare },
  { id: 'timeline', label: 'Timeline', Icon: CalendarRange },
  { id: 'table', label: 'Table', Icon: Table2 },
];

const DUE_FILTERS = [
  { id: 'overdue', label: 'Overdue' },
  { id: 'today', label: 'Today' },
  { id: 'undated', label: 'No date' },
];

export default function Projects({ onOpenSettings }) {
  const store = useProjects();
  const project = store.active;

  const [view, setView] = useState('board');
  const [query, setQuery] = useState('');
  const [labels, setLabels] = useState([]);
  const [due, setDue] = useState(null);
  const [openCardId, setOpenCardId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const searchRef = useRef(null);

  const today = dayKey();

  // A card open in the detail panel must follow the store, not the copy it was
  // opened with — ticking something off inside it has to show immediately.
  const openCard = useMemo(
    () => (openCardId ? (project?.cards ?? []).find((c) => c.id === openCardId) ?? null : null),
    [openCardId, project],
  );

  const filtered = useMemo(
    () => filterCards(project?.cards ?? [], { text: query, labels, due }, today),
    [project, query, labels, due, today],
  );

  const progress = useMemo(() => projectProgress(project), [project]);
  const filtering = Boolean(query.trim() || labels.length || due);

  const clearFilters = useCallback(() => {
    setQuery('');
    setLabels([]);
    setDue(null);
  }, []);

  // Moving between boards should not carry the last one's search with it.
  useEffect(() => {
    clearFilters();
    setOpenCardId(null);
  }, [project?.id, clearFilters]);

  // The shortcuts a board is expected to have.
  useEffect(() => {
    const typing = (el) =>
      el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable || el.tagName === 'SELECT');
    const onKey = (event) => {
      if (event.key === '/' && !typing(event.target)) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (event.key === 'Escape' && !typing(event.target)) {
        if (openCardId) setOpenCardId(null);
        else if (settingsOpen) setSettingsOpen(false);
        else if (filtering) clearFilters();
      }
      if (!typing(event.target) && ['1', '2', '3'].includes(event.key)) {
        setView(VIEWS[Number(event.key) - 1].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openCardId, settingsOpen, filtering, clearFilters]);

  if (!project) {
    return (
      <div className="flex h-full flex-col">
        <SkyZone className="flex items-end">
          <div>
            <p className="t-eyebrow">Projects</p>
            <h1 className="t-hero mt-3">Nothing on the go</h1>
            <p className="t-lede mt-3 max-w-[32rem]">
              A board is lanes you name, cards you drag between them, and the dates that put them on a timeline.
            </p>
            <button type="button" onClick={() => store.addProject()} className="pill pill-lit mt-6 h-10 px-4">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Start a project
            </button>
          </div>
        </SkyZone>
        <Ground />
      </div>
    );
  }

  const tint = colourOf(project.colour).hex;

  return (
    <div className="flex h-full flex-col">
      <SkyZone className="flex items-end justify-between gap-10">
        <div className="min-w-0 flex-1">
          <p className="t-eyebrow">Projects</p>
          <h1 className="t-hero mt-2 truncate">{project.name}</h1>

          <p className="t-lede mt-2 flex flex-wrap items-center gap-x-3">
            <span className="display-figures text-moon" style={{ fontSize: '1.4em', lineHeight: 1 }}>
              {progress.done}
            </span>
            <span className="text-moon/75">of {progress.total} done</span>
            {project.description ? <span className="t-micro truncate">{project.description}</span> : null}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {/* Which board. A picker, because boards are a list that grows. */}
            {store.projects.length > 1 ? (
              <div className="relative shrink-0">
                <select
                  value={project.id}
                  onChange={(event) => store.select(event.target.value)}
                  aria-label="Which project"
                  className="h-9 max-w-[13rem] appearance-none truncate rounded-full bg-white/[0.07] pl-4 pr-9 text-[0.875rem] text-moon shadow-[inset_0_0_0_1px_rgba(255,255,255,0.09)] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                >
                  {store.projects.map((p) => (
                    <option key={p.id} value={p.id} className="bg-ink text-moon">
                      {p.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-moon/50" aria-hidden="true" />
              </div>
            ) : null}

            <button type="button" onClick={() => store.addProject()} className="pill h-9 px-4">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Project
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Project settings"
              className="pill h-9 w-9 px-0 text-moon/75"
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            {/* How to look at it. */}
            <div className="proj-views" role="tablist" aria-label="How to view this project">
              {VIEWS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={view === id}
                  onClick={() => setView(id)}
                  className="proj-view"
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>

            <form className="relative" onSubmit={(event) => event.preventDefault()}>
              <label htmlFor="proj-search" className="sr-only">Search cards</label>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-moon/45" aria-hidden="true" />
              <input
                id="proj-search"
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search  ( / )"
                className="h-9 w-[13rem] rounded-full bg-white/[0.07] pl-9 pr-3 text-[0.875rem] text-moon shadow-[inset_0_0_0_1px_rgba(255,255,255,0.09)] outline-none transition placeholder:text-moon/40 focus:bg-white/[0.11] focus:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_45%,transparent)]"
              />
            </form>
          </div>

          {/* Filters, only once there is something to filter by. */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {project.labels.map((label) => {
              const on = labels.includes(label.id);
              const hex = colourOf(label.colour).hex;
              return (
                <button
                  key={label.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setLabels((c) => (on ? c.filter((id) => id !== label.id) : [...c, label.id]))}
                  className="proj-chip"
                  style={on ? { color: hex, background: `color-mix(in srgb, ${hex} 22%, transparent)`, boxShadow: `inset 0 0 0 1px ${hex}` } : { color: hex }}
                >
                  <span className="proj-dot" style={{ background: hex }} aria-hidden="true" />
                  {label.name}
                </button>
              );
            })}
            {DUE_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={due === f.id}
                onClick={() => setDue((c) => (c === f.id ? null : f.id))}
                className={`proj-chip ${due === f.id ? 'proj-chip--on' : ''}`}
              >
                {f.label}
              </button>
            ))}
            {filtering ? (
              <button type="button" onClick={clearFilters} className="proj-chip proj-chip--clear">
                <X className="h-3 w-3" aria-hidden="true" />
                {filtered.length} of {progress.total}
              </button>
            ) : null}
          </div>
        </div>

        {/* How far through, as a ring — the one figure worth seeing from here. */}
        <div className="hidden shrink-0 pb-1 lg:block">
          <Ring ratio={progress.total ? progress.ratio : 0} tint={tint} />
        </div>
      </SkyZone>

      <Ground className={view === 'board' ? 'proj-ground proj-ground--board' : 'proj-ground'}>
        {view === 'board' ? (
          <ProjectBoard project={project} store={store} cards={filtered} filtering={filtering} onOpenCard={setOpenCardId} />
        ) : view === 'timeline' ? (
          <ProjectTimeline project={project} cards={filtered} today={today} onOpenCard={setOpenCardId} />
        ) : (
          <ProjectTable project={project} store={store} cards={filtered} today={today} onOpenCard={setOpenCardId} />
        )}
      </Ground>

      {openCard ? (
        <CardDetail
          project={project}
          card={openCard}
          store={store}
          today={today}
          onClose={() => setOpenCardId(null)}
        />
      ) : null}

      {settingsOpen ? (
        <ProjectSettings project={project} store={store} onClose={() => setSettingsOpen(false)} onOpenSettings={onOpenSettings} />
      ) : null}
    </div>
  );
}

/** The project's progress, drawn once rather than said twice. */
function Ring({ ratio, tint }) {
  const size = 92;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  return (
    <div className="relative grid place-items-center" aria-hidden="true">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tint}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          style={{ transition: 'stroke-dashoffset 600ms var(--ease-out)' }}
        />
      </svg>
      <span className="display-figures absolute text-[1.25rem] text-moon">{Math.round(ratio * 100)}%</span>
    </div>
  );
}
