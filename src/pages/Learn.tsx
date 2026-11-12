import { Link } from '../components/nav'
import { Check, Clock } from 'lucide-react'
import { LESSONS, MODULES } from '../learn/content'
import { useLearnProgress } from '../lib/data'
import { Bar, PageHeader } from '../components/ui'
import { BackButton } from '../components/back'

export default function Learn() {
  const { data: progress = [] } = useLearnProgress()
  const done = new Map(progress.map((p) => [p.lesson_id, p]))
  const next = LESSONS.find((l) => !done.has(l.id))
  const total = LESSONS.length

  return (
    <div>
      <BackButton label="Home" fallback="/" />
      <PageHeader title="Impara" subtitle="Le idee migliori dei libri di finanza personale, adattate all'Italia e collegate ai tuoi numeri." />

      <section className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div>
          <p className="text-sm text-muted">{done.size} di {total} lezioni completate</p>
          <div className="mt-2 max-w-md"><Bar value={done.size} max={total} tone={done.size === total ? 'gold' : 'brand'} /></div>
        </div>
        {next && <Link to={`/impara/${next.id}`} className="btn btn-primary">{done.size ? 'Continua' : 'Inizia dalla prima lezione'}</Link>}
      </section>

      <ol className="space-y-10">
        {MODULES.map((m, mi) => {
          const lessons = LESSONS.filter((l) => l.module === m.id)
          const completed = lessons.filter((l) => done.has(l.id)).length
          return (
            <li key={m.id} className="rise grid grid-cols-1 gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]" style={{ '--i': mi } as React.CSSProperties}>
              <div>
                <p className="num text-sm text-muted">Modulo {mi + 1}</p>
                <h2 className="text-xl font-semibold leading-snug">{m.title}</h2>
                <p className="mt-1 text-sm text-muted">{m.text}</p>
                <p className="mt-2 text-xs text-faint">{completed} di {lessons.length} completate</p>
              </div>
              <ul className="divide-y divide-line rounded-3xl bg-surface">
                {lessons.map((l) => {
                  const p = done.get(l.id)
                  const isNext = next?.id === l.id
                  return (
                    <li key={l.id}>
                      <Link to={`/impara/${l.id}`} className="press flex items-start gap-3 px-4 py-4 hover:bg-sunken sm:gap-4 sm:px-5">
                        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${p ? 'bg-brand text-brand-ink' : isNext ? 'border-2 border-brand' : 'border border-line'}`}>
                          {p && <Check size={15} strokeWidth={3} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium leading-snug">{l.title}</span>
                          <span className="mt-0.5 block text-sm text-muted">{l.summary}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1 text-xs text-faint"><Clock size={13} />{l.minutes} min</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
