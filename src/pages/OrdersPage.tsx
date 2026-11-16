import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api, ApiError } from '../api'
import type { Order } from '../api'
import { LoginPanel } from '../components/LoginPanel'
import { Panel } from '../components/Shell'
import { PanelSkeleton } from '../components/Skeleton'
import { MAIN_SITE_URL } from '../config'
import { formatDate, formatINR } from '../lib/format'
import { useSession } from '../session'
import { t } from '../strings'

// A student's past orders with status (FR-O1, FR-O2).
export function OrdersPage() {
  const { student, setStudent } = useSession()
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [failed, setFailed] = useState(false)
  const studentId = student?.id

  useEffect(() => {
    if (!studentId) return
    let cancelled = false
    api
      .listOrders()
      .then((list) => !cancelled && setOrders(list))
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof ApiError && err.code === 'unauthenticated') setStudent(null)
        else setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [studentId, setStudent])

  if (student === null) {
    return (
      <Panel>
        <LoginPanel title={t.login.loginToView} onDone={setStudent} />
      </Panel>
    )
  }
  if (failed) {
    return (
      <Panel className="is-centered">
        <h2>{t.errors.generic}</h2>
        <p className="lead">{t.errors.network}</p>
      </Panel>
    )
  }
  if (student === undefined || !orders) {
    return <PanelSkeleton />
  }

  return (
    <Panel>
      <h2>{t.orders.title}</h2>
      {orders.length === 0 ? (
        <p className="lead">
          {t.orders.empty} <a href={MAIN_SITE_URL}>{t.cart.emptyLink}</a>
        </p>
      ) : (
        <div className="cartItems order-list">
          {orders.map((o) => (
            <div className="summary-item" key={o.id}>
              <div className="product-details">
                <span className="product-name">
                  {o.items[0]?.title}
                  {o.items.length > 1 && t.orders.more(o.items.length - 1)}
                </span>
                <span className="product-size">
                  {o.orderNumber} · {formatDate(o.paidAt ?? o.createdAt)}
                </span>
                <span className="product-size">
                  {formatINR(o.summary.totalPayable)} · {t.orderStatus[o.status]}
                  {o.shipment && (o.status === 'PAID' || o.status === 'FULFILLED') && ` · ${t.shipmentStatusLabel[o.shipment.status]}`}
                </span>
              </div>
              <Link className="apply-btn" to={`/order/${o.id}`}>
                {t.orders.view}
              </Link>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}
