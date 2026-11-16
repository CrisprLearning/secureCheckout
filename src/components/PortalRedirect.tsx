import { useEffect, useRef, useState } from 'react'
import type { Order } from '../api'
import { goToPortal, orderPortalTarget } from '../lib/portal'
import { t } from '../strings'
import { useToast } from './Toast'

const SECONDS = 5
const doneKey = (orderId: string) => `crispr-redirected-${orderId}`

/** True only right after paying: reopening or reloading a receipt later must not send the student away again. */
// eslint-disable-next-line react-refresh/only-export-components
export function shouldAutoRedirect(orderId: string, justPaid: boolean): boolean {
  if (!justPaid) return false
  try {
    return sessionStorage.getItem(doneKey(orderId)) === null
  } catch {
    return true
  }
}

// Shown under "Your payment is successful!": a spinner with a 5-second countdown, then the redirect to the
// Students Portal, then a manual link in case the redirect did not happen.
export function PortalRedirect({ order }: { order: Order }) {
  const toast = useToast()
  const [left, setLeft] = useState(SECONDS)
  const started = useRef(false)
  const target = orderPortalTarget(order)

  useEffect(() => {
    if (left <= 0) return
    const timer = setTimeout(() => setLeft((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [left])

  useEffect(() => {
    if (left > 0 || started.current || !target) return
    started.current = true
    try {
      sessionStorage.setItem(doneKey(order.id), '1')
    } catch {
      // Storage blocked: a reload may redirect once more.
    }
    // If the key cannot be issued the manual link below is already on screen.
    goToPortal(target.type, target.id, target.itemId).catch(() => {})
  }, [left, target, order.id])

  if (!target) return null

  return (
    <div className="portal-redirect no-print" role="status">
      <div className="loader is-dark" aria-hidden="true" />
      <p>{left > 0 ? t.order.redirectIn(left) : t.order.redirecting}</p>
      {left <= 0 && (
        <p>
          <button
            type="button"
            className="text-btn"
            onClick={() => goToPortal(target.type, target.id, target.itemId).catch(() => toast(t.order.handoffError))}
          >
            {t.order.clickHere}
          </button>
          {t.order.clickHereRest}
        </p>
      )}
    </div>
  )
}
