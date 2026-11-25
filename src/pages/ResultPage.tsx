import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import type { CartLine } from '../api'
import { CartLines, SummaryLines } from '../components/CartLines'
import { Panel } from '../components/Shell'
import { SUPPORT_EMAIL, SUPPORT_PHONE } from '../config'
import { track, trackPurchaseOnce } from '../lib/analytics'
import { forgetCouponCode, rememberCouponCode, saveCart } from '../lib/cart'
import { formatDate } from '../lib/format'
import { loadResult, portalUrlFor, saveResult } from '../lib/result'
import type { PaymentRecord } from '../lib/result'
import { t } from '../strings'

const REDIRECT_SECONDS = 5

// Under "Your payment is successful!": a spinner with a countdown, then the move to the Students Portal,
// then a manual link in case the browser did not go.
function PortalRedirect({ record }: { record: PaymentRecord }) {
  const [left, setLeft] = useState(REDIRECT_SECONDS)
  const started = useRef(false)
  const target = portalUrlFor(record.items[0]?.type)

  useEffect(() => {
    if (left <= 0) return
    const timer = setTimeout(() => setLeft((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [left])

  useEffect(() => {
    if (left > 0 || started.current) return
    started.current = true
    saveResult({ ...record, redirected: true })
    track('portal_handoff')
    window.location.assign(target)
  }, [left, record, target])

  return (
    <div className="portal-redirect no-print" role="status">
      <div className="loader is-dark" aria-hidden="true" />
      <p>{left > 0 ? t.result.redirectIn(left) : t.result.redirecting}</p>
      {left <= 0 && (
        <p>
          <a href={target}>{t.result.clickHere}</a>
          {t.result.clickHereRest}
        </p>
      )}
    </div>
  )
}

// What happened to the payment: success, failed (with Retry Payment), or paid-but-not-confirmed.
export function ResultPage() {
  const navigate = useNavigate()
  // Read once: the countdown marks the record as redirected, which must not hide the countdown mid-way.
  const [record] = useState(loadResult)

  useEffect(() => {
    if (record?.status === 'success') {
      trackPurchaseOnce(record.orderNumber, { value: record.summary.totalPayable / 100, currency: 'INR' })
    }
  }, [record])

  if (!record) return <Navigate to="/cart" replace />

  const facts = (
    <dl className="order-facts">
      {record.orderNumber && (
        <div>
          <dt>{t.result.orderNumber}</dt>
          <dd>{record.orderNumber}</dd>
        </div>
      )}
      {record.paymentId && (
        <div>
          <dt>{t.result.paymentRef}</dt>
          <dd>{record.paymentId}</dd>
        </div>
      )}
      <div>
        <dt>{t.result.date}</dt>
        <dd>{formatDate(record.at)}</dd>
      </div>
    </dl>
  )

  if (record.status === 'failed') {
    // Put this attempt's items back in the cart, then let the cart page start the payment again.
    const retry = () => {
      saveCart(record.items)
      if (record.discountCode) rememberCouponCode(record.discountCode)
      else forgetCouponCode()
      navigate('/cart', { state: { retryPayment: true } })
    }
    return (
      <Panel>
        <div className="confirm-head">
          <div className="status-mark is-bad" aria-hidden="true">
            ✕
          </div>
          <h2>{t.result.failedTitle}</h2>
          <p className="lead">
            {record.reason && <>{t.result.failedReason(record.reason)} </>}
            {t.result.failedBody}
          </p>
        </div>
        <CartLines lines={record.items} planBehindIcon />
        <SummaryLines summary={record.summary} totalLabel={t.result.amountDue} />
        <button className="pay-btn" type="button" onClick={retry}>
          {t.result.retry}
        </button>
        <p className="pay-hint">{t.result.failedDebited}</p>
        {facts}
      </Panel>
    )
  }

  if (record.status === 'unconfirmed') {
    return (
      <Panel>
        <div className="confirm-head">
          <div className="status-mark is-muted" aria-hidden="true">
            !
          </div>
          <h2>{t.result.unconfirmedTitle}</h2>
          <p className="lead">{t.result.unconfirmedBody}</p>
          {record.reason && <p className="lead">{record.reason}</p>}
          <p className="support-note" role="note">
            {t.result.supportNoteBefore}
            <a href={`tel:+91${SUPPORT_PHONE}`}>{SUPPORT_PHONE}</a>
            {t.result.supportNoteOr}
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
            {t.result.supportNoteAfter}
          </p>
        </div>
        <CartLines lines={record.items} planBehindIcon />
        <SummaryLines summary={record.summary} totalLabel={t.result.amountPaid} />
        {facts}
      </Panel>
    )
  }

  return (
    <Panel>
      <div className="confirm-head">
        <div className="status-mark" aria-hidden="true">
          ✓
        </div>
        <h2>{t.result.successTitle}</h2>
        <p className="lead">{t.result.successBody}</p>
        {!record.redirected && <PortalRedirect record={record} />}
      </div>

      <CartLines
        lines={record.items}
        extra={(line: CartLine) => (
          <a className="apply-btn portal-btn" href={portalUrlFor(line.type)}>
            {t.portalButton[line.type] ?? t.portalDefault}
          </a>
        )}
      />
      <SummaryLines summary={record.summary} totalLabel={t.result.amountPaid} />
      {facts}

      <section className="payment-section no-print">
        <button className="text-btn" type="button" onClick={() => window.print()}>
          {t.result.receipt}
        </button>
      </section>
    </Panel>
  )
}
