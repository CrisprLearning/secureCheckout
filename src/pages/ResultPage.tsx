import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import type { CartLine } from '../api'
import { CartLines, SummaryLines } from '../components/CartLines'
import { Panel } from '../components/Shell'
import { PORTAL_URL, SUPPORT_EMAIL, SUPPORT_PHONE } from '../config'
import { track, trackPurchaseOnce } from '../lib/analytics'
import { forgetCouponCode, rememberCouponCode, saveCart } from '../lib/cart'
import { formatDate } from '../lib/format'
import { loadResult, portalUrlFor } from '../lib/result'
import { t } from '../strings'

// What happened to the payment: success, failed (with Retry Payment), or paid-but-not-confirmed.
export function ResultPage() {
  const navigate = useNavigate()
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
        <CartLines lines={record.items} planStatus="failed" />
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
        <CartLines lines={record.items} planStatus="unconfirmed" />
        <SummaryLines summary={record.summary} totalLabel={t.result.amountPaid} />
        {facts}
      </Panel>
    )
  }

  return (
    <Panel>
      <div className="confirm-head">
        {/* A filled green badge with the tick drawn in. */}
        <div className="status-mark is-success" aria-hidden="true">
          <svg viewBox="0 0 64 64" width="64" height="64" fill="none">
            <circle cx="32" cy="32" r="30" className="success-ring" />
            <circle cx="32" cy="32" r="23" className="success-disc" />
            <path d="M21.5 33.2l7.2 7.1 14.2-15" className="success-tick" />
          </svg>
        </div>
        <h2>{t.result.successTitle}</h2>
        <p className="lead">{t.result.successBody}</p>
      </div>

      <CartLines
        lines={record.items}
        planStatus="success"
        // Only a test series has a button here, straight to its exams.
        extra={(line: CartLine) =>
          t.portalButton[line.type] ? (
            <a className="apply-btn portal-btn" href={portalUrlFor(line.type)}>
              {t.portalButton[line.type]}
            </a>
          ) : null
        }
      />
      <SummaryLines summary={record.summary} totalLabel={t.result.amountPaid} />
      {facts}

      {/* Onward to the page the server named: the test series or course just paid for, or the order. */}
      <a className="pay-btn track-btn no-print" href={record.portalUrl ?? PORTAL_URL} onClick={() => track('portal_handoff')}>
        {t.result.track}
      </a>

      <section className="payment-section no-print">
        <button className="text-btn" type="button" onClick={() => window.print()}>
          {t.result.receipt}
        </button>
      </section>
    </Panel>
  )
}
