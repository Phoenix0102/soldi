import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts'
import { money, monthShort, monthLabel } from '../lib/format'

/** Andamento del patrimonio: una sola serie, sul pannello verde. */
export function NetworthSpark({ data }: { data: { month: Date; value: number }[] }) {
  if (data.length < 2) return null
  return (
    <div className="h-24 w-full" role="img" aria-label="Andamento del patrimonio negli ultimi 12 mesi">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="nw" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--note-ink)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--note-ink)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Tooltip cursor={{ stroke: 'var(--note-ink)', strokeOpacity: 0.4 }} content={({ active, payload }) =>
            active && payload?.[0] ? (
              <div className="rounded-xl bg-surface px-3 py-2 text-ink shadow-lg">
                <div className="num font-semibold">{money(payload[0].value as number)}</div>
                <div className="text-xs text-muted capitalize">{monthLabel((payload[0].payload as { month: Date }).month)}</div>
              </div>
            ) : null} />
          <Area type="monotone" dataKey="value" stroke="var(--note-ink)" strokeWidth={2} fill="url(#nw)" animationDuration={1100} animationEasing="ease-out" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Entrate e uscite mensili a confronto. */
export function CashflowBars({ data }: { data: { month: Date; income: number; expense: number }[] }) {
  return (
    <div>
      <div className="mb-3 flex gap-5 text-sm text-muted">
        <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-[3px] bg-c-in" />Entrate</span>
        <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-[3px] bg-c-out" />Uscite</span>
      </div>
      <div className="h-52 w-full" role="img" aria-label="Entrate e uscite degli ultimi 6 mesi">
        <ResponsiveContainer>
          <BarChart data={data} barGap={2} barCategoryGap="28%" margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="month" tickFormatter={(d: Date) => monthShort(d)} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} />
            <YAxis width={44} tickLine={false} axisLine={false} tick={{ fill: 'var(--faint)', fontSize: 11 }} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v))} />
            <Tooltip cursor={{ fill: 'var(--sunken)' }} content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload as { month: Date; income: number; expense: number }
              return (
                <div className="rounded-xl border border-line bg-surface px-3 py-2 text-sm shadow-lg">
                  <div className="mb-1 text-xs text-muted capitalize">{monthLabel(p.month)}</div>
                  <Row color="var(--c-in)" label="Entrate" value={p.income} />
                  <Row color="var(--c-out)" label="Uscite" value={p.expense} />
                  <div className="mt-1 border-t border-line pt-1"><Row label="Risparmio" value={p.income - p.expense} /></div>
                </div>
              )
            }} />
            <Bar dataKey="income" fill="var(--c-in)" radius={[4, 4, 0, 0]} maxBarSize={22} animationDuration={700} />
            <Bar dataKey="expense" fill="var(--c-out)" radius={[4, 4, 0, 0]} maxBarSize={22} animationDuration={700} animationBegin={120} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function Row({ color, label, value }: { color?: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className="inline-flex items-center gap-2 text-muted">{color && <span className="h-0.5 w-3" style={{ background: color }} />}{label}</span>
      <span className="num font-semibold">{money(value)}</span>
    </div>
  )
}
