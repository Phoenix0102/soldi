import { BackButton } from '../components/back'
import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { Link, useGo } from '../components/nav'
import { BookOpen, Check, X, Lightbulb } from 'lucide-react'
import { LESSONS, MODULES, lessonById, type Block } from '../learn/content'
import { Apply } from '../learn/Apply'
import { useLearnProgress, useInvalidate } from '../lib/data'
import { supabase } from '../lib/supabase'
import { Empty, useToast } from '../components/ui'

/** Rende il grassetto **così** dentro i testi delle lezioni. */
function rich(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
  )
}

export default function Lesson() {
  const { lessonId = '' } = useParams()
  const nav = useGo()
  const lesson = lessonById(lessonId)
  const { data: progress = [] } = useLearnProgress()
  const invalidate = useInvalidate()
  const toast = useToast()
  const [answers, setAnswers] = useState<Record<number, number>>({})
  useEffect(() => { setAnswers({}) }, [lessonId])

  if (!lesson) return <Empty title="Lezione non trovata" action={<Link to="/impara" className="btn btn-ghost">Torna al percorso</Link>} />

  const idx = LESSONS.indexOf(lesson)
  const next = LESSONS[idx + 1]
  const mod = MODULES.find((m) => m.id === lesson.module)
  const already = progress.find((p) => p.lesson_id === lesson.id)
  const answered = Object.keys(answers).length
  const score = lesson.quiz.reduce((s, q, i) => s + (answers[i] === q.correct ? 1 : 0), 0)
  const finished = answered === lesson.quiz.length

  const complete = async () => {
    const { error } = await supabase.from('learn_progress').upsert({ lesson_id: lesson.id, quiz_score: score, quiz_total: lesson.quiz.length, completed_at: new Date().toISOString() }, { onConflict: 'user_id,lesson_id' })
    if (error) return toast('Non sono riuscito a salvare i progressi', { tone: 'err' })
    invalidate('learn_progress')
    toast(score === lesson.quiz.length ? 'Lezione completata, tutte giuste' : `Lezione completata, ${score} su ${lesson.quiz.length}`)
    nav(next ? `/impara/${next.id}` : '/impara')
  }

  return (
    <article className="mx-auto max-w-[42rem]">
      <BackButton label="Impara" fallback="/impara" always />
      <p className="text-sm text-muted">{mod?.title}, {lesson.minutes} minuti di lettura</p>
      <h1 className="mt-1 text-[2rem] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-[2.4rem]">{lesson.title}</h1>
      <p className="mt-3 text-lg text-muted">{lesson.summary}</p>

      <div className="prose-lesson mt-8 text-[1.06rem]">
        {lesson.body.map((b, i) => <BlockView key={i} b={b} />)}
      </div>

      {lesson.apply && <Apply k={lesson.apply} />}

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Verifica</h2>
        <p className="text-sm text-muted">{already ? `L'hai già completata con ${already.quiz_score} su ${already.quiz_total}. Puoi rifarla.` : 'Tre domande per fissare le idee.'}</p>
        <ol className="mt-5 space-y-6">
          {lesson.quiz.map((q, qi) => {
            const a = answers[qi]
            const done = a !== undefined
            return (
              <li key={qi}>
                <p className="font-medium"><span className="num text-muted">{qi + 1}. </span>{q.q}</p>
                <div className="mt-3 grid grid-cols-1 gap-2">
                  {q.options.map((o, oi) => {
                    const isRight = oi === q.correct, picked = a === oi
                    return (
                      <button key={oi} disabled={done} onClick={() => setAnswers({ ...answers, [qi]: oi })}
                        className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                          !done ? 'border-line bg-surface hover:border-brand' : isRight ? 'border-pos bg-pos/10' : picked ? 'border-neg bg-neg/10' : 'border-line bg-surface opacity-60'}`}>
                        <span>{o}</span>
                        {done && isRight && <Check size={18} className="shrink-0 text-pos" />}
                        {done && picked && !isRight && <X size={18} className="shrink-0 text-neg" />}
                      </button>
                    )
                  })}
                </div>
                {done && <p className="fade-enter mt-2 text-sm text-muted"><strong className={a === q.correct ? 'text-pos' : 'text-neg'}>{a === q.correct ? 'Esatto. ' : 'Non proprio. '}</strong>{q.explain}</p>}
              </li>
            )
          })}
        </ol>
        <button onClick={complete} disabled={!finished} className="btn btn-primary mt-8 w-full py-3.5 text-base">
          {finished ? (next ? 'Completa e vai alla prossima' : 'Completa il percorso') : `Rispondi a tutte le domande (${answered}/${lesson.quiz.length})`}
        </button>
      </section>

      <footer className="mt-10 border-t border-line pt-5 text-sm text-muted">
        <p className="flex items-center gap-2 font-medium text-ink"><BookOpen size={16} /> Per approfondire</p>
        <ul className="mt-2 space-y-1">{lesson.books.map((b) => <li key={b}>{b}</li>)}</ul>
        <p className="mt-4 text-xs">Contenuto educativo, non consulenza finanziaria. Le regole fiscali indicate sono aggiornate a novembre 2026 e possono cambiare.</p>
      </footer>
    </article>
  )
}

function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    case 'p': return <p>{rich(b.text)}</p>
    case 'key': return (
      <aside className="my-6 flex gap-3 rounded-2xl bg-note p-5 text-note-ink">
        <Lightbulb size={20} className="mt-0.5 shrink-0 opacity-80" />
        <p className="!m-0 font-medium leading-relaxed">{rich(b.text)}</p>
      </aside>
    )
    case 'example': return (
      <div className="my-6 border-l-2 border-gold pl-5">
        <p className="!mb-1 text-sm font-semibold text-gold">{b.title}</p>
        <p className="!mb-0">{rich(b.text)}</p>
      </div>
    )
    case 'do': return (
      <div className="my-6 rounded-2xl bg-surface p-5">
        <p className="!mb-3 font-semibold">Da fare questa settimana</p>
        <ul className="space-y-2">
          {b.items.map((it, i) => <li key={i} className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" /><span>{rich(it)}</span></li>)}
        </ul>
      </div>
    )
  }
}
