import { ArrowLeftRight, Camera, Zap } from 'lucide-react'
import { Badge } from './Icon'
import type { Account, Category, Transaction } from '../lib/types'
import { money } from '../lib/format'
import { useQuickAdd } from './QuickAdd'

export function TxRow({ t, cat, acc, showAccount = true }: { t: Transaction; cat?: Category; acc?: Account; showAccount?: boolean }) {
  const qa = useQuickAdd()
  const transfer = t.kind === 'transfer'
  return (
    <button onClick={() => qa.edit(t)} className="press flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left hover:bg-sunken">
      {transfer ? (
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sunken text-muted"><ArrowLeftRight size={17} /></span>
      ) : (
        <Badge icon={cat?.icon ?? 'circle'} color={cat?.color ?? '#94a3b8'} />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5 font-medium"><span className="truncate">
          {t.description || cat?.name || 'Movimento'}</span>
          {t.source === 'receipt' && <Camera size={13} className="shrink-0 text-faint" aria-label="Da scontrino" />}
          {t.source === 'shortcut' && <Zap size={13} className="shrink-0 text-faint" aria-label="Da Apple Pay" />}
        </span>
        <span className="block truncate text-sm text-muted">
          {transfer ? 'Giroconto' : cat?.name ?? 'Da categorizzare'}
          {showAccount && acc ? `, ${acc.name}` : ''}
        </span>
      </span>
      <span className={`num shrink-0 font-semibold ${t.amount > 0 && !transfer ? 'text-pos' : transfer ? 'text-muted' : ''}`}>
        {t.amount > 0 ? '+' : '−'}{money(Math.abs(t.amount))}
      </span>
    </button>
  )
}
