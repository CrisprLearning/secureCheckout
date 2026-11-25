// Payment plans: a course can be paid in full or in instalments, when the catalogue offers plans for it.
// An instalment with no due date is paid at checkout; the rest are paid later. Amounts are in paise.

import type { CartLine, Installment, PaymentPlan } from '../api/types'
import { t } from '../strings'

/** The plan a line is on: the buyer's pick, or the catalogue's first plan until they pick one. */
export function chosenPlan(line: CartLine): PaymentPlan | undefined {
  return line.plans?.find((p) => p.type === line.plan) ?? line.plans?.[0]
}

/** True when part of the line's price is paid after checkout. */
export function isInstalment(line: CartLine): boolean {
  const plan = chosenPlan(line)
  return !!plan && plan.type !== 'FULL'
}

/** What one unit of the line pays at checkout. */
export function dueNow(line: CartLine): number {
  if (!isInstalment(line)) return line.unitPrice
  return chosenPlan(line)!.installments.filter((i) => i.dueDate === '').reduce((sum, i) => sum + i.amount, 0)
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** Reads a commencement date written as "5 April, 2025". */
function parseDay(text: string | undefined): Date | null {
  const m = /^\s*(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*,?\s+(\d{4})\s*$/.exec(text ?? '')
  const month = m ? MONTHS.indexOf(m[2].toLowerCase()) : -1
  return m && month >= 0 ? new Date(Number(m[3]), month, Number(m[1])) : null
}

const dayFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * When an instalment is to be paid, in words. dueDate is a number of days before (-) or after (+) the
 * reference: DOJ is the date of joining (today, the day of purchase), DOC the course's commencement date.
 */
export function dueText(inst: Installment, commencement?: string): string {
  if (inst.dueDate === '') return t.plan.payNow
  const days = Number(inst.dueDate)
  if (!Number.isFinite(days)) return t.plan.later
  const isDoc = inst.dueDateReference.toUpperCase() === 'DOC'
  const base = isDoc ? parseDay(commencement) : new Date()
  if (!base) return t.plan.relativeToStart(Math.abs(days), days < 0)
  const due = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days)
  return t.plan.dueOn(dayFormat.format(due))
}
