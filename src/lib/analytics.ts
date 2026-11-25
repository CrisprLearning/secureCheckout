// GA4 events. They carry item IDs, types and amounts only, never personal data.
// Events go to window.dataLayer; they are picked up once a GA4 / Tag Manager snippet is added to index.html.

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
