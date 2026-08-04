import {
  ArrowDownRight,
  ArrowUpRight,
  BadgePoundSterling,
  Landmark,
  Plus,
  RotateCcw,
  Wallet,
} from 'lucide-react';
import GlassCard from '../components/GlassCard.jsx';
import ViewHeader from '../components/ViewHeader.jsx';
import { AddRow, EditableAmount, EditableText, RemoveButton } from '../components/InlineEdit.jsx';
import { useFinanceStore } from '../hooks/useFinanceStore.js';
import { formatCurrency, formatCurrencyDetailed } from '../utils/formatters.js';

function SpendingChart({ data }) {
  const width = 600;
  const height = 150;
  const padding = 18;
  const max = Math.max(...data.map((point) => point.value));
  const min = Math.min(...data.map((point) => point.value));
  const range = max - min || 1;
  const points = data.map((point, index) => {
    const x = padding + (index * (width - padding * 2)) / Math.max(data.length - 1, 1);
    const y = height - padding - ((point.value - min) / range) * (height - padding * 2);
    return { ...point, x, y };
  });
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
  const area = `${path} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-full w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label="Spending trend line chart"
    >
      <defs>
        <linearGradient id="spendingLine" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#74f2ff" />
        </linearGradient>
        <linearGradient id="spendingArea" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#74f2ff" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#74f2ff" stopOpacity="0" />
        </linearGradient>
        <filter id="chartGlow" x="-20%" y="-40%" width="140%" height="180%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>
      {[0, 1, 2].map((line) => {
        const y = padding + (line * (height - padding * 2)) / 2;
        return (
          <line
            key={line}
            x1={padding}
            x2={width - padding}
            y1={y}
            y2={y}
            stroke="rgba(255,255,255,0.07)"
          />
        );
      })}
      <path d={area} fill="url(#spendingArea)" />
      <path
        d={path}
        fill="none"
        stroke="rgba(116,242,255,0.45)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="6"
        filter="url(#chartGlow)"
      />
      <path
        d={path}
        fill="none"
        stroke="url(#spendingLine)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.5"
      />
      {points.map((point, index) => (
        <circle
          key={index}
          cx={point.x}
          cy={point.y}
          r="3.5"
          fill="#0d1428"
          stroke="#ffffff"
          strokeWidth="1.8"
        />
      ))}
    </svg>
  );
}

function GlowBar({ ratio }) {
  return (
    <div className="h-1 overflow-hidden rounded-full bg-white/8">
      <div
        className="glow-dot h-full rounded-full bg-gradient-to-r from-white/80 to-cyan-200 text-cyan-200 transition-all duration-700"
        style={{ width: `${Math.min(Math.max(ratio, 0), 1) * 100}%` }}
      />
    </div>
  );
}

function CardLabel({ label }) {
  return (
    <p className="mb-2.5 shrink-0 text-[0.625rem] font-semibold uppercase tracking-[0.24em] text-white/42">
      {label}
    </p>
  );
}

const gbp = (value) => formatCurrency(value);

export default function Finance() {
  const { data, setField, updateItem, addItem, removeItem, reset } = useFinanceStore();

  const cashflow = data.monthlyIncome - data.monthlyExpenses;

  const metrics = [
    {
      label: 'Net worth',
      value: data.netWorth,
      onChange: (value) => setField('netWorth', value),
      Icon: Wallet,
      tone: 'text-white/90',
    },
    {
      label: 'Income',
      value: data.monthlyIncome,
      onChange: (value) => setField('monthlyIncome', value),
      Icon: ArrowUpRight,
      tone: 'text-emerald-200',
    },
    {
      label: 'Expenses',
      value: data.monthlyExpenses,
      onChange: (value) => setField('monthlyExpenses', value),
      Icon: ArrowDownRight,
      tone: 'text-rose-200',
    },
    {
      label: 'Cashflow',
      value: cashflow,
      derived: true,
      Icon: BadgePoundSterling,
      tone: cashflow >= 0 ? 'text-cyan-100' : 'text-rose-200',
    },
  ];

  const updateTrend = (index, patch) =>
    setField(
      'spendingTrend',
      data.spendingTrend.map((point, i) => (i === index ? { ...point, ...patch } : point)),
    );

  const addMonth = () => setField('spendingTrend', [...data.spendingTrend, { label: 'New', value: 0 }]);

  const removeMonth = (index) =>
    setField(
      'spendingTrend',
      data.spendingTrend.filter((_, i) => i !== index),
    );

  return (
    <div className="flex h-full flex-col">
      <ViewHeader
        lead="Your"
        accent="Finances"
        subtitle="Balances, bills & goals"
        action={
          <button
            type="button"
            onClick={reset}
            className="soft-button inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Reset
          </button>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-12 grid-rows-[auto_1fr_1.12fr] gap-4">
        {/* Unified summary band — liquid balance + the four flow metrics */}
        <GlassCard
          tone="purple"
          className="col-span-12 flex flex-wrap items-center gap-x-6 gap-y-3 overflow-hidden"
        >
          <div className="min-w-0 flex-1">
            <p className="text-[0.625rem] font-semibold uppercase tracking-[0.24em] text-white/42">
              Liquid balance
            </p>
            <EditableAmount
              value={data.currentBalance}
              onChange={(value) => setField('currentBalance', value)}
              format={gbp}
              align="left"
              auto
              aria-label="Liquid balance"
              className="clock-figures mt-0.5 text-4xl font-extralight text-white text-glow"
            />
          </div>

          <div className="flex flex-1 flex-wrap items-stretch justify-end gap-x-5 gap-y-2">
            {metrics.map((metric) => (
              <div
                key={metric.label}
                className="flex min-w-[7rem] items-center gap-2.5 border-l border-white/10 pl-4 first:border-l-0 first:pl-0"
              >
                <span className={`soft-row grid h-8 w-8 shrink-0 place-items-center rounded-xl ${metric.tone}`}>
                  <metric.Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-white/40">
                    {metric.label}
                  </p>
                  {metric.derived ? (
                    <p className={`clock-figures mt-0.5 text-xl font-light ${metric.tone}`}>
                      {gbp(metric.value)}
                    </p>
                  ) : (
                    <EditableAmount
                      value={metric.value}
                      onChange={metric.onChange}
                      format={gbp}
                      align="left"
                      auto
                      aria-label={metric.label}
                      className="clock-figures mt-0.5 text-xl font-light text-white/92"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Spending trend — full-width focal chart with an editable month axis */}
        <GlassCard tone="cyan" delay={120} className="col-span-12 flex min-h-0 flex-col overflow-hidden">
          <CardLabel label="Spending trend · monthly" />
          <div className="min-h-0 flex-1">
            <SpendingChart data={data.spendingTrend} />
          </div>
          <div className="mt-2 flex shrink-0 items-end gap-0.5">
            {data.spendingTrend.map((point, index) => (
              <div key={index} className="group relative min-w-0 flex-1 text-center">
                {data.spendingTrend.length > 1 ? (
                  <RemoveButton
                    onClick={() => removeMonth(index)}
                    label={`Remove ${point.label}`}
                    className="absolute right-0 top-0 z-10 p-0.5"
                  />
                ) : null}
                <EditableAmount
                  value={point.value}
                  onChange={(value) => updateTrend(index, { value })}
                  format={gbp}
                  align="center"
                  aria-label={`${point.label} spend`}
                  className="clock-figures w-full text-[0.6875rem] font-medium text-white/80"
                />
                <EditableText
                  value={point.label}
                  onChange={(value) => updateTrend(index, { label: value })}
                  align="center"
                  aria-label={`Month ${index + 1} label`}
                  className="w-full text-[0.625rem] uppercase tracking-[0.12em] text-white/40"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={addMonth}
              aria-label="Add month"
              className="group/add flex shrink-0 flex-col items-center justify-end pb-3.5 pl-1 text-white/30 transition hover:text-cyan-100/70 focus:outline-none focus-visible:text-cyan-100/70"
            >
              <span className="grid h-4 w-4 place-items-center rounded-full border border-dashed border-white/25 transition group-hover/add:border-cyan-100/55">
                <Plus className="h-2.5 w-2.5" aria-hidden="true" />
              </span>
            </button>
          </div>
        </GlassCard>

        {/* Accounts */}
        <GlassCard tone="green" delay={180} className="col-span-4 flex min-h-0 flex-col overflow-hidden">
          <CardLabel label="Accounts" />
          <div className="glass-scroll min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {data.accounts.map((account) => (
              <div
                key={account.id}
                className="group soft-row flex items-center gap-2 rounded-xl px-3 py-2"
              >
                <Landmark className="h-3.5 w-3.5 shrink-0 text-white/55" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <EditableText
                    value={account.name}
                    onChange={(value) => updateItem('accounts', account.id, { name: value })}
                    aria-label="Account name"
                    className="w-full text-xs font-medium text-white/85"
                  />
                  <EditableText
                    value={account.type}
                    onChange={(value) => updateItem('accounts', account.id, { type: value })}
                    aria-label="Account type"
                    className="w-full text-[0.625rem] text-white/38"
                  />
                </div>
                <EditableAmount
                  value={account.balance}
                  onChange={(value) => updateItem('accounts', account.id, { balance: value })}
                  format={gbp}
                  aria-label="Account balance"
                  className="clock-figures w-20 text-xs font-medium text-white"
                />
                <RemoveButton onClick={() => removeItem('accounts', account.id)} />
              </div>
            ))}
            <AddRow
              label="Account"
              onClick={() =>
                addItem('accounts', { name: 'New account', type: 'Checking', balance: 0 })
              }
            />
          </div>
        </GlassCard>

        {/* Upcoming bills */}
        <GlassCard tone="amber" delay={240} className="col-span-4 flex min-h-0 flex-col overflow-hidden">
          <CardLabel label="Upcoming bills" />
          <div className="glass-scroll min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {data.upcomingBills.map((bill) => (
              <div
                key={bill.id}
                className="group soft-row flex items-center gap-2 rounded-xl px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <EditableText
                    value={bill.name}
                    onChange={(value) => updateItem('upcomingBills', bill.id, { name: value })}
                    aria-label="Bill name"
                    className="w-full text-xs font-medium text-white/85"
                  />
                  <EditableText
                    value={bill.due}
                    onChange={(value) => updateItem('upcomingBills', bill.id, { due: value })}
                    aria-label="Bill due date"
                    className="w-full text-[0.625rem] text-white/38"
                  />
                </div>
                <EditableAmount
                  value={bill.amount}
                  onChange={(value) => updateItem('upcomingBills', bill.id, { amount: value })}
                  format={formatCurrencyDetailed}
                  aria-label="Bill amount"
                  className="clock-figures w-20 text-xs font-medium text-white"
                />
                <RemoveButton onClick={() => removeItem('upcomingBills', bill.id)} />
              </div>
            ))}
            <AddRow
              label="Bill"
              onClick={() => addItem('upcomingBills', { name: 'New bill', due: 'TBC', amount: 0 })}
            />
          </div>
        </GlassCard>

        {/* Savings goals */}
        <GlassCard tone="purple" delay={300} className="col-span-4 flex min-h-0 flex-col overflow-hidden">
          <CardLabel label="Savings goals" />
          <div className="glass-scroll min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
            {data.savingsGoals.map((goal) => (
              <div key={goal.id} className="group">
                <div className="mb-1 flex items-center gap-2 text-xs">
                  <EditableText
                    value={goal.name}
                    onChange={(value) => updateItem('savingsGoals', goal.id, { name: value })}
                    aria-label="Goal name"
                    className="min-w-0 flex-1 font-medium text-white/78"
                  />
                  <span className="clock-figures flex shrink-0 items-center text-white/45">
                    <EditableAmount
                      value={goal.current}
                      onChange={(value) => updateItem('savingsGoals', goal.id, { current: value })}
                      format={gbp}
                      auto
                      aria-label="Goal saved"
                    />
                    <span className="px-0.5">/</span>
                    <EditableAmount
                      value={goal.target}
                      onChange={(value) => updateItem('savingsGoals', goal.id, { target: value })}
                      format={gbp}
                      auto
                      aria-label="Goal target"
                    />
                  </span>
                  <RemoveButton onClick={() => removeItem('savingsGoals', goal.id)} />
                </div>
                <GlowBar ratio={goal.target ? goal.current / goal.target : 0} />
                <div className="mt-1 flex items-center gap-1 text-[0.625rem] uppercase tracking-[0.14em] text-white/32">
                  <span>Target</span>
                  <EditableText
                    value={goal.due}
                    onChange={(value) => updateItem('savingsGoals', goal.id, { due: value })}
                    aria-label="Goal target date"
                    auto
                    className="text-white/45"
                  />
                </div>
              </div>
            ))}
            <AddRow
              label="Goal"
              onClick={() =>
                addItem('savingsGoals', { name: 'New goal', current: 0, target: 1000, due: 'TBC' })
              }
            />
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
