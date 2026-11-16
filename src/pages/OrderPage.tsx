import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { api, ApiError } from '../api'
import type { Order } from '../api'
import { CartLines, SummaryLines } from '../components/CartLines'
import { LoginPanel } from '../components/LoginPanel'
import { PortalButton } from '../components/PortalButton'
import { PortalRedirect, shouldAutoRedirect } from '../components/PortalRedirect'
import { Panel } from '../components/Shell'
import { PanelSkeleton } from '../components/Skeleton'
import { trackPurchaseOnce } from '../lib/analytics'
import { forgetCouponCode, rememberCouponCode, syncCart } from '../lib/cart'
import { formatDate } from '../lib/format'
import { useSession } from '../session'
import { t } from '../strings'

const POLL_MS = 3000
const MAX_POLLS = 40 // about two minutes; after that the webhook or reconciliation job finishes the order

type State = { kind: 'loading' } | { kind: 'not_found' } | { kind: 'error' } | { kind: 'order'; order: Order; polls: number }

function Message({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <Panel className="is-centered">
      <h2>{title}</h2>
      <p className="lead">{body}</p>
      {children}
    </Panel>
  )
}

// Confirmation screen. It always reads the order from the server (section 8, step 6) and can be reopened
// from its URL by the same student only (FR-S5).
export function OrderPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  // Set by the cart page when Razorpay reports a failed payment for this order.
  const failure = useLocation().state as { paymentFailed?: boolean; reason?: string; justPaid?: boolean } | null
  // Decided once per visit, so the countdown is not cut short when it records that it has run.
  const [autoRedirect] = useState(() => shouldAutoRedirect(id, failure?.justPaid === true))
  const { student, setStudent } = useSession()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const studentId = student?.id

  useEffect(() => {
    if (!studentId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    async function load(polls: number) {
      try {
        const order = await api.getOrder(id)
        if (cancelled) return
        setState({ kind: 'order', order, polls })
        if (order.status === 'CREATED' && polls < MAX_POLLS) timer = setTimeout(() => load(polls + 1), POLL_MS)
      } catch (err) {
        if (cancelled) return
        if (err instanceof ApiError && err.code === 'unauthenticated') setStudent(null)
        else if (err instanceof ApiError && err.code === 'not_found') setState({ kind: 'not_found' })
        else if (polls < MAX_POLLS) timer = setTimeout(() => load(polls + 1), POLL_MS)
        else setState({ kind: 'error' })
      }
    }
    void load(0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [id, studentId, setStudent])

  const order = state.kind === 'order' ? state.order : null
  const paid = order?.status === 'PAID' || order?.status === 'FULFILLED'

  useEffect(() => {
    if (order && paid) {
      trackPurchaseOnce(order.orderNumber, { value: order.summary.totalPayable / 100, currency: 'INR' })
    }
  }, [order, paid])

  if (student === undefined) {
    return <PanelSkeleton />
  }
  if (student === null) {
    return (
      <Panel>
        <LoginPanel title={t.login.loginToView} onDone={setStudent} />
      </Panel>
    )
  }
  if (state.kind === 'loading') {
    return <PanelSkeleton />
  }
  if (state.kind === 'not_found') return <Message title={t.order.notFoundTitle} body={t.order.notFoundBody} />
  if (state.kind === 'error') return <Message title={t.errors.generic} body={t.errors.network} />

  const o = state.order

  const failed = o.status === 'FAILED' || o.status === 'EXPIRED' || (o.status === 'CREATED' && failure?.paymentFailed === true)

  if (failed) {
    // Put this order's items back in the cart, then let the cart page start the payment again.
    const retry = () => {
      syncCart(o.items)
      if (o.summary.discount.code) rememberCouponCode(o.summary.discount.code)
      else forgetCouponCode()
      navigate('/cart', { state: { retryPayment: true } })
    }
    return (
      <Panel>
        <div className="confirm-head">
          <div className="status-mark is-bad" aria-hidden="true">
            ✕
          </div>
          <h2>{t.order.failedTitle}</h2>
          <p className="lead">
            {failure?.reason && <>{t.order.failedReason(failure.reason)} </>}
            {t.order.failedBody}
          </p>
        </div>

        <CartLines lines={o.items.map((l) => ({ ...l, owned: false }))} />
        <SummaryLines summary={o.summary} totalLabel={t.order.amountDue} />

        <button className="pay-btn" type="button" onClick={retry}>
          {t.order.retry}
        </button>
        <p className="pay-hint">{t.order.failedDebited}</p>

        <dl className="order-facts">
          <div>
            <dt>{t.order.orderNumber}</dt>
            <dd>{o.orderNumber}</dd>
          </div>
        </dl>
      </Panel>
    )
  }

  if (o.status === 'CREATED') {
    return (
      <Message title={t.order.pendingTitle} body={state.polls < MAX_POLLS ? t.order.pendingBody : t.order.pendingLong}>
        {state.polls < MAX_POLLS && <div className="loader is-dark" role="status" aria-label={t.pay.verifying} />}
      </Message>
    )
  }

  const refunded = o.status === 'REFUNDED'
  const hasBooks = o.items.some((l) => l.type === 'Book')
  const firstBookId = o.items.find((l) => l.type === 'Book')?.itemId

  return (
    <Panel>
      <div className="confirm-head">
        <div className={`status-mark ${refunded ? 'is-muted' : ''}`} aria-hidden="true">
          {refunded ? '↩' : '✓'}
        </div>
        <h2>{refunded ? t.order.refundedTitle : t.order.successTitle}</h2>
        <p className="lead">{refunded ? t.order.refundedBody : t.order.successBody}</p>
        {!refunded && autoRedirect && <PortalRedirect order={o} />}
      </div>

      <CartLines
        lines={o.items.map((l) => ({ ...l, owned: false }))}
        extra={(line) => {
          if (refunded || !('portalRef' in line)) return null
          // One "Track My Order" for the whole order, however many books it holds.
          if (line.type === 'Book') {
            return line.itemId === firstBookId ? <PortalButton type="Book" id={o.id} itemId={line.itemId} /> : null
          }
          return <PortalButton type={line.type} id={line.portalRef} itemId={line.itemId} />
        }}
      />

      <SummaryLines summary={o.summary} totalLabel={t.order.amountPaid} />

      <dl className="order-facts">
        <div>
          <dt>{t.order.orderNumber}</dt>
          <dd>{o.orderNumber}</dd>
        </div>
        {o.paymentRef && (
          <div>
            <dt>{t.order.paymentRef}</dt>
            <dd>{o.paymentRef}</dd>
          </div>
        )}
        {o.paidAt && (
          <div>
            <dt>{t.order.date}</dt>
            <dd>{formatDate(o.paidAt)}</dd>
          </div>
        )}
        {hasBooks && (
          <div>
            <dt>{t.order.deliverTo}</dt>
            <dd>
              {o.billing.fullname}
              <br />
              {o.billing.address}, {o.billing.locality}
              <br />
              {o.billing.city}, {o.billing.state} {o.billing.pincode}
            </dd>
          </div>
        )}
        {o.shipment && (
          <div>
            <dt>{t.order.shipmentStatus}</dt>
            <dd>
              {t.shipmentStatusLabel[o.shipment.status]}
              {o.shipment.courier && o.shipment.trackingNumber && (
                <>
                  <br />
                  {t.order.tracking(o.shipment.courier, o.shipment.trackingNumber)}
                </>
              )}
            </dd>
          </div>
        )}
      </dl>

      <section className="payment-section no-print">
        <button className="text-btn" type="button" onClick={() => window.print()}>
          {t.order.receipt}
        </button>
        {' · '}
        <Link to="/orders">{t.order.allOrders}</Link>
      </section>
    </Panel>
  )
}
