// GA4 events (AN-1) and UTM capture (AN-3). Events carry item ID and type only, never personal data (AN-7).
// Cart-wide events (begin_checkout, purchase) carry the amount; item events carry the item ID and type.
// Events go to window.dataLayer; they are picked up once a GA4 / Tag Manager snippet is added to index.html.

import type { Utm } from '../api/types'
import { MAIN_SITE_URL } from '../config'

type EventName =
  | 'view_cart'
  | 'login_started'
  | 'login_completed'
  | 'begin_checkout'
  | 'purchase'
  | 'payment_failed'
  | 'portal_handoff'

interface EventParams {
  item_id?: string
  item_type?: string
  value?: number
  currency?: string
  transaction_id?: string
}

declare global {
  interface Window {
    dataLayer?: unknown[]
  }
}

export function track(event: EventName, params: EventParams = {}) {
  window.dataLayer ??= []
  window.dataLayer.push({ event, ...params })
}

/** Fires `purchase` at most once per order in this browser (AC-16). */
export function trackPurchaseOnce(orderNumber: string, params: EventParams) {
  const key = `crispr-purchase-${orderNumber}`
  try {
    if (localStorage.getItem(key)) return
    localStorage.setItem(key, '1')
  } catch {
    // Storage unavailable: fall through and send once for this page view.
  }
  track('purchase', { ...params, transaction_id: orderNumber })
}

const UTM_KEY = 'crispr-utm'

/** Reads utm_* and the referring main-site page from the landing URL and remembers them for the session. */
export function captureUtm(search: string): Utm {
  let utm: Utm = {}
  try {
    utm = JSON.parse(sessionStorage.getItem(UTM_KEY) ?? '{}') as Utm
  } catch {
    // Ignore unreadable storage.
  }
  const params = new URLSearchParams(search)
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign'] as const) {
    const v = params.get(k)
    if (v) utm[k] = v.slice(0, 100)
  }
  if (!utm.referrer && document.referrer.startsWith(MAIN_SITE_URL)) {
    // Path only: query strings on the referrer could carry personal data.
    utm.referrer = new URL(document.referrer).pathname
  }
  try {
    sessionStorage.setItem(UTM_KEY, JSON.stringify(utm))
  } catch {
    // Ignore.
  }
  return utm
}
