import { useRef, useState } from 'react'
import { ArrowLeftRight, Camera, Zap, Tag, Trash2, Target } from 'lucide-react'
import { Badge } from './Icon'
import type { Account, Category, Transaction } from '../lib/types'
import { money } from '../lib/format'
import { useQuickAdd } from './QuickAdd'
import { useTxActions } from './TxActions'
import { useInPager } from './pane'

const ACTION_W = 148 // larghezza dei due pulsanti rivelati

/**
 * Riga di un movimento. Tocco: modifica. Pressione lunga: menu rapido.
 * Fuori dalle schede (dove lo swipe cambia scheda) si trascina a sinistra per Categoria ed Elimina.
 */
export function TxRow({ t, cat, acc, showAccount = true }: { t: Transaction; cat?: Category; acc?: Account; showAccount?: boolean }) {
  const qa = useQuickAdd()
  const actions = useTxActions()
  const inPager = useInPager()
  const transfer = t.kind === 'transfer'
  const [dx, setDx] = useState(0)
  const [pressed, setPressed] = useState(false)
  const g = useRef({ x0: 0, y0: 0, base: 0, mode: 'idle' as 'idle' | 'pending' | 'swipe' | 'scroll', timer: 0, long: false })

  const settle = (x: number) => setDx(x < -ACTION_W / 2 ? -ACTION_W : 0)

  const onTouchStart = (e: React.TouchEvent) => {
    const p = e.touches[0]
    g.current = { ...g.current, x0: p.clientX, y0: p.clientY, base: dx, mode: 'pending', long: false }
    setPressed(true)
    g.current.timer = window.setTimeout(() => {
      if (g.current.mode !== 'pending') return
      g.current.long = true
      setPressed(false)
      actions.open(t)
    }, 430)
  }
  const onTouchMove = (e: React.TouchEvent) => {
    const s = g.current
    if (s.mode === 'idle' || s.mode === 'scroll') return
    const p = e.touches[0]
    const mx = p.clientX - s.x0, my = p.clientY - s.y0
    if (s.mode === 'pending') {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return
      clearTimeout(s.timer); setPressed(false)
      s.mode = !inPager && Math.abs(mx) > Math.abs(my) * 1.2 && (mx < 0 || s.base < 0) ? 'swipe' : 'scroll'
      if (s.mode === 'scroll') return
    }
    const x = Math.min(0, s.base + mx)
    setDx(x < -ACTION_W ? -ACTION_W + (x + ACTION_W) * 0.35 : x)
  }
  const onTouchEnd = () => {
    const s = g.current
    clearTimeout(s.timer); setPressed(false)
    if (s.mode === 'swipe') {
      // Swipe lungo: elimina subito (con Annulla)
      if (dx < -ACTION_W - 70) { setDx(0); actions.remove(t) } else settle(dx)
    }
    s.mode = 'idle'
  }
  const onClick = (e: React.MouseEvent) => {
    if (g.current.long) { e.preventDefault(); g.current.long = false; return }
    if (dx !== 0) { setDx(0); return }
    qa.edit(t)
  }

  return (
    <div className="tx-row relative overflow-hidden rounded-2xl">
      {!inPager && (
        <div className="absolute inset-y-0 right-0 flex" style={{ width: ACTION_W }} aria-hidden={dx === 0}>
          <button onClick={() => { setDx(0); actions.open(t, 'category') }} className="flex flex-1 flex-col items-center justify-center gap-1 bg-brand text-xs font-semibold text-brand-ink"><Tag size={18} />Categoria</button>
          <button onClick={() => { setDx(0); actions.remove(t) }} className="flex flex-1 flex-col items-center justify-center gap-1 bg-neg text-xs font-semibold text-white"><Trash2 size={18} />Elimina</button>
        </div>
      )}
      <button onClick={onClick} onContextMenu={(e) => { e.preventDefault(); actions.open(t) }}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}
        className={`tx-row-main relative flex w-full items-center gap-3 bg-paper px-2 py-2.5 text-left ${pressed ? 'is-pressed' : ''}`}
        style={{ transform: dx ? `translate3d(${dx}px,0,0)` : undefined, transition: g.current.mode === 'swipe' ? 'none' : undefined }}>
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
            {t.goal_id && <Target size={13} className="shrink-0 text-brand" aria-label="Collegato a un obiettivo" />}
          </span>
          <span className="block truncate text-sm text-muted">
            {transfer ? 'Giroconto' : cat?.name ?? 'Da categorizzare'}
            {showAccount && acc ? `, ${acc.name}` : ''}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className={`num block font-semibold ${t.amount > 0 && !transfer ? 'text-pos' : transfer ? 'text-muted' : ''}`}>
            {t.amount > 0 ? '+' : '−'}{money(Math.abs(t.amount))}
          </span>
          {t.original_currency && t.original_amount != null && (
            <span className="num block text-xs text-faint">{Math.abs(t.original_amount).toLocaleString('it-IT', { style: 'currency', currency: t.original_currency })}</span>
          )}
        </span>
      </button>
    </div>
  )
}
