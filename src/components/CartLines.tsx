import type { ReactNode } from 'react'
import type { CartLine, Summary } from '../api'
import { formatINR } from '../lib/format'
import { t } from '../strings'

const DEFAULT_COURSE_PIC = 'https://img.icons8.com/color/96/book.png'
const DEFAULT_TEST_PIC = 'https://img.icons8.com/color/96/system-information.png'

function lineImage(line: CartLine) {
  return line.displayImage || (line.type === 'Test Series' ? DEFAULT_TEST_PIC : DEFAULT_COURSE_PIC)
}

/** The item rows of the order summary. `action` adds a control at the row's edge, `extra` one under its title. */
export function CartLines({
  lines,
  action,
  extra,
}: {
  lines: CartLine[]
  action?: (line: CartLine) => ReactNode
  extra?: (line: CartLine) => ReactNode
}) {
  return (
    <div className={`cartItems ${action ? 'has-action' : ''}`}>
      {lines.map((line) => (
        <div className="summary-item" key={line.itemId}>
          {action?.(line)}
          <div className="product-info">
            <img src={lineImage(line)} alt="" width="52" height="52" />
            <div className="product-details">
              <span className="product-name">{line.title}</span>
              <span className="product-size">x {line.number}</span>
              {extra?.(line)}
            </div>
          </div>
          <span className="price">{formatINR(line.unitPrice * line.number)}</span>
        </div>
      ))}
    </div>
  )
}

/** Subtotal, discounts, taxes, extras and total, as computed by the server. */
export function SummaryLines({ summary, totalLabel = t.cart.total }: { summary: Summary; totalLabel?: string }) {
  return (
    <div className="cartSummary">
      <div className="summary-item">
        <span>{t.cart.subtotal}</span>
        <span>{formatINR(summary.subTotal)}</span>
      </div>
      {summary.discount.amount > 0 && (
        <div className="summary-item">
          <span>{t.cart.discounts}</span>
          <span>-{formatINR(summary.discount.amount)}</span>
        </div>
      )}
      {[...summary.taxes, ...summary.extras].map((row) => (
        <div className="summary-item" key={row.label}>
          <span>{row.label}</span>
          <span>{formatINR(row.value)}</span>
        </div>
      ))}
      <div className="summary-item total">
        <span>{totalLabel}</span>
        <span className="price">{formatINR(summary.totalPayable)}</span>
      </div>
    </div>
  )
}
