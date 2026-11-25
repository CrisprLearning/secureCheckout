import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import type { CartLine, ChargeRow, PaymentPlan, Summary } from '../api'
import { isDelivered, optionLabel } from '../lib/cart'
import { formatINR } from '../lib/format'
import { chosenPlan, dueText, isInstalment, isSingle } from '../lib/plans'
import { t } from '../strings'

const DEFAULT_COURSE_PIC = 'https://img.icons8.com/color/96/book.png'
const DEFAULT_TEST_PIC = 'https://img.icons8.com/color/96/system-information.png'

function lineImage(line: CartLine) {
  return line.displayImage || (line.type === 'Test Series' ? DEFAULT_TEST_PIC : DEFAULT_COURSE_PIC)
}

/** The instalments of a plan: what each is, how much, and when it is paid. */
export function PlanSchedule({ plan, commencement, count }: { plan: PaymentPlan; commencement?: string; count: number }) {
  return (
    <ul className="plan-schedule">
      {plan.installments.map((inst, i) => (
        <li key={i} className={inst.dueDate === '' ? 'is-now' : ''}>
          <span>{inst.label}</span>
          <span>{formatINR(inst.amount * count)}</span>
          <span>{dueText(inst, commencement)}</span>
        </li>
      ))}
    </ul>
  )
}

/** The item rows of the order summary. `action` adds a control at the row's edge, `extra` one under its title; `quantity` draws the count; without it books and merchandise show "x 2" and courses and test series show nothing. */
export function CartLines({
  lines,
  action,
  extra,
  quantity,
  options,
}: {
  lines: CartLine[]
  action?: (line: CartLine) => ReactNode
  extra?: (line: CartLine) => ReactNode
  quantity?: (line: CartLine) => ReactNode
  /** Pickers for a line's choices. Without it the picks are shown as text ("Size: M"). */
  options?: (line: CartLine) => ReactNode
}) {
  return (
    <div className={`cartItems ${action ? 'has-action' : ''}`}>
      {lines.map((line) => (
        <div className={`summary-item ${action && isDelivered(line) ? 'has-qty' : ''}`} key={line.itemId}>
          {action?.(line)}
          <div className="product-info">
            <img src={lineImage(line)} alt="" width="52" height="52" />
            <div className="product-details">
              <span className="product-name">{line.title}</span>
              {quantity ? quantity(line) : !isSingle(line) && <span className="product-size">x {line.number}</span>}
              {options
                ? options(line)
                : Object.entries(line.options ?? {}).map(([name, value]) => (
                    <span className="product-size" key={name}>
                      {optionLabel(name)}: {value}
                    </span>
                  ))}
              {!options && isInstalment(line) && (
                <>
                  <span className="product-size">
                    {t.plan.title}: {chosenPlan(line)!.label}
                  </span>
                  <PlanSchedule plan={chosenPlan(line)!} commencement={line.commencement} count={line.number} />
                </>
              )}
              {extra?.(line)}
            </div>
          </div>
          <span className="price">{formatINR(line.unitPrice * line.number)}</span>
        </div>
      ))}
    </div>
  )
}

/** The info icon beside a tax or extra charge. Hovering, focusing or clicking it shows how much each item adds. */
function ChargeSplit({ row }: { row: ChargeRow }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <span className={`charge-info ${open ? 'is-open' : ''}`} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={t.cart.chargeSplit(row.label)}
        aria-expanded={open}
        aria-describedby={id}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      >
        i
      </button>
      <span className="charge-split" role="tooltip" id={id}>
        <strong>{t.cart.chargeSplitTitle(row.label)}</strong>
        {row.items!.map((item) => (
          <span className="charge-split-row" key={item.itemId}>
            <span>{item.title ?? item.itemId}</span>
            <span>{formatINR(item.value)}</span>
          </span>
        ))}
      </span>
    </span>
  )
}

/** Subtotal, discounts, taxes, extras and total, as computed by the server. */
export function SummaryLines({ summary, totalLabel = (summary.payLater ?? 0) > 0 ? t.plan.payingNow : t.cart.total }: { summary: Summary; totalLabel?: string }) {
  return (
    <div className="cartSummary">
      <div className="summary-item">
        <span>{t.cart.subtotal}</span>
        <span>{formatINR(summary.subTotal)}</span>
      </div>
      {(summary.payLater ?? 0) > 0 && (
        <div className="summary-item">
          <span>{t.plan.payLater}</span>
          <span>-{formatINR(summary.payLater!)}</span>
        </div>
      )}
      {summary.discount.amount > 0 && (
        <div className="summary-item">
          <span>{t.cart.discounts}</span>
          <span>-{formatINR(summary.discount.amount)}</span>
        </div>
      )}
      {[...summary.taxes, ...summary.extras].map((row) => (
        <div className="summary-item" key={row.label}>
          <span className="charge-label">
            {row.label}
            {(row.items ?? []).length > 0 && <ChargeSplit row={row} />}
          </span>
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
