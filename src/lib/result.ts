// The outcome of the last payment attempt, kept for this browser tab so the result screen survives a reload.
// The live APIs have no "get my order" call, so this record is the only source for that screen.

import type { CartLine, Summary } from '../api/types'

export interface PaymentRecord {
  /** `unconfirmed`: Razorpay reported success but the server could not confirm it. */
  status: 'success' | 'failed' | 'unconfirmed'
  items: CartLine[]
  summary: Summary
  discountCode: string
  /** Crispr's order number. */
  orderNumber: string
  /** Razorpay payment ID, once a payment was made. */
  paymentId?: string
  /** The Students Portal page the server named as the next stop: the test series or course just paid for, or the order. */
  portalUrl?: string
  /** Why it failed, or what the server said when it could not confirm. */
  reason?: string
  at: string
}

const KEY = 'crispr-payment-result'

export function saveResult(record: PaymentRecord) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(record))
  } catch {
    // Storage blocked: the result screen then relies on the navigation state alone.
  }
}

export function loadResult(): PaymentRecord | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as PaymentRecord) : null
  } catch {
    return null
  }
}
