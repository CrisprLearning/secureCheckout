import { t } from '../strings'

// Shimmering placeholders shown while a page loads. They take the shape of the content that is coming,
// so the layout does not jump when it arrives.

function Bar({ w = '100%', h = 14, r = 8 }: { w?: number | string; h?: number; r?: number }) {
  return <span className="sk" style={{ width: w, height: h, borderRadius: r }} />
}

function ItemRow() {
  return (
    <div className="sk-row">
      <Bar w={52} h={52} r={14} />
      <div className="sk-stack">
        <Bar w="80%" />
        <Bar w="35%" h={11} />
      </div>
      <Bar w={64} />
    </div>
  )
}

function TotalRow({ strong = false }: { strong?: boolean }) {
  return (
    <div className="sk-row is-spread">
      <Bar w={strong ? 70 : 90} h={strong ? 18 : 12} />
      <Bar w={strong ? 110 : 70} h={strong ? 18 : 12} />
    </div>
  )
}

/** Totals area of the order summary, while the server prices the cart after login. */
export function SummaryShimmer() {
  return (
    <div className="cartSummary sk-panel" role="status" aria-busy="true" aria-label={t.loading}>
      <Bar h={48} r={14} />
      <TotalRow />
      <TotalRow />
      <div className="sk-divider" />
      <TotalRow strong />
    </div>
  )
}

/** The checkout page: login / billing panel beside the order summary. */
export function CartSkeleton() {
  return (
    <div className="container" role="status" aria-busy="true" aria-label={t.loading}>
      <div className="form-column">
        <section className="form-section sk-panel">
          <Bar w="45%" h={24} />
          <Bar w="70%" h={12} />
          <Bar h={54} r={16} />
          <Bar w={220} h={46} r={999} />
          <div className="sk-divider" />
          <Bar w="92%" h={11} />
          <Bar w="60%" h={11} />
        </section>
      </div>
      <section className="summary-section sk-panel">
        <Bar w="50%" h={24} />
        <ItemRow />
        <ItemRow />
        <div className="sk-divider" />
        <TotalRow />
        <TotalRow strong />
        <Bar h={50} r={999} />
      </section>
    </div>
  )
}

/** A single centred panel: order confirmation and My Orders. */
export function PanelSkeleton() {
  return (
    <div className="container" role="status" aria-busy="true" aria-label={t.loading}>
      <section className="form-section solo sk-panel">
        <div className="sk-center">
          <Bar w={60} h={60} r={999} />
          <Bar w="62%" h={22} />
          <Bar w="45%" h={12} />
        </div>
        <ItemRow />
        <ItemRow />
        <div className="sk-divider" />
        <TotalRow />
        <TotalRow />
        <TotalRow strong />
      </section>
    </div>
  )
}
