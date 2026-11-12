/* Dati per il widget iOS della schermata Home: li scrive il plugin nativo WidgetBridge. */
import { registerPlugin } from '@capacitor/core'
import { isNative } from './native'

type WidgetData = {
  networth: number; delta: number; monthExpense: number; monthIncome: number
  budgetSpent: number; budgetTotal: number; month: string; updatedAt: string
}

const Bridge = registerPlugin<{ update(o: { json: string }): Promise<void> }>('WidgetBridge')
let last = ''

export function updateWidget(d: Omit<WidgetData, 'updatedAt'>) {
  if (!isNative()) return
  const json = JSON.stringify({ ...d, updatedAt: new Date().toISOString() })
  const key = JSON.stringify(d)
  if (key === last) return
  last = key
  Bridge.update({ json }).catch(() => { last = '' })
}
