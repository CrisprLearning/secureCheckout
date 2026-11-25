// The outcome of the last payment attempt, kept for this browser tab so the result screen survives a reload.
// The live APIs have no "get my order" call, so this record is the only source for that screen.

import type { CartLine, Summary } from '../api/types'
import { PORTAL_URL } from '../config'

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
  /** Why it failed, or what the server said when it could not confirm. */
  reason?: string
  at: string
  /** Set once the success screen has sent the student to the portal, so a reload does not do it again. */
  redirected?: boolean
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

/** Where the portal shows an item of this type. The portal asks for login first if it needs to, then continues there. */
export function portalUrlFor(type?: string): string {
  const path = type === 'Course' ? '/courses' : type === 'Test Series' ? '/test-series' : '/'
  return `${PORTAL_URL}${path}`
}
