import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import type { CartLine, ChargeRow, PaymentPlan, Summary } from '../api'
import { optionLabel, rowId } from '../lib/cart'
import { formatINR } from '../lib/format'
import { chosenPlan, dueNow, dueText, isInstalment, isSingle } from '../lib/plans'
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

/** The info icon beside "Payment plan: Installments". Hovering, focusing or clicking it shows the instalments. */
/** How the first payment of a plan went: it decides the mark on the first step of the timeline. */
type PlanStatus = 'success' | 'failed' | 'unconfirmed'

const FIRST_STEP_MARK: Record<PlanStatus, ReactNode> = {
  // Paid: a tick.
  success: <path d="M3.5 8.4l2.8 2.8 6.2-6.4" />,
  // Payment failed: a cross.
  failed: <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />,
  // Paid but not confirmed yet: a clock.
  unconfirmed: (
    <>
      <circle cx="8" cy="8" r="5.4" />
      <path d="M8 5v3.3l2.1 1.3" />
    </>
  ),
}

/** The instalments of a plan as a timeline: the payment made at checkout first, then each one still to come. */
function PlanTimeline({ plan, commencement, count, status }: { plan: PaymentPlan; commencement?: string; count: number; status: PlanStatus }) {
  // What is paid at checkout comes first, whatever order the plan lists it in.
  const steps = [...plan.installments.filter((i) => i.dueDate === ''), ...plan.installments.filter((i) => i.dueDate !== '')]
  return (
    <ol className="plan-timeline">
      {steps.map((inst, i) => (
        <li key={i} className={i === 0 ? `is-first is-${status}` : ''}>
          <span className="plan-timeline-mark" aria-hidden="true">
            {i === 0 && (
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {FIRST_STEP_MARK[status]}
              </svg>
            )}
          </span>
          <span className="plan-timeline-text">
            <span>{inst.label}</span>
            <small>{i === 0 ? t.plan.firstStep[status] : dueText(inst, commencement)}</small>
          </span>
          <span className="plan-timeline-amount">{formatINR(inst.amount * count)}</span>
        </li>
      ))}
    </ol>
  )
}

function PlanInfo({ line, status }: { line: CartLine; status: PlanStatus }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <span className={`charge-info ${open ? 'is-open' : ''}`} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={t.plan.viewDetails}
        aria-expanded={open}
        aria-describedby={id}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      >
        i
      </button>
      <span className="charge-split plan-split" role="tooltip" id={id}>
        <PlanTimeline plan={chosenPlan(line)!} commencement={line.commencement} count={line.number} status={status} />
      </span>
    </span>
  )
}

/** The item rows of the order summary. `action` adds a control at the row's edge, `extra` one under its title; `quantity` draws the count; without it books and merchandise show "x 2" and courses and test series show nothing. */
export function CartLines({
  lines,
  action,
  extra,
  quantity,
  options,
  underPrice,
  planStatus,
}: {
  lines: CartLine[]
  action?: (line: CartLine) => ReactNode
  extra?: (line: CartLine) => ReactNode
  quantity?: (line: CartLine) => ReactNode
  /** Pickers for a line's choices. Without it the picks are shown as text ("Size: M"). */
  options?: (line: CartLine) => ReactNode
  /** Drawn in the price column, under the amount and its small print. */
  underPrice?: (line: CartLine) => ReactNode
  /** After a payment: keeps an instalment schedule behind an info icon, as a timeline whose first step shows how that payment went. */
  planStatus?: PlanStatus
}) {
  return (
    <div className={`cart-rows ${action ? 'has-action' : ''}`}>
      {lines.map((line) => (
        <div className="cart-row" key={rowId(line)}>
          <img className="cart-thumb" src={lineImage(line)} alt="" width="64" height="64" />
          <div className="cart-details">
            <span className="product-name">{line.title}</span>
            {line.type && <span className="product-meta">{line.type}</span>}
            {/* The count comes first, then the pickers (size). */}
            <div className="cart-controls">
              {quantity ? quantity(line) : !isSingle(line) && <span className="product-size">x {line.number}</span>}
              {options
                ? options(line)
                : Object.entries(line.options ?? {}).map(([name, value]) => (
                    <span className="product-size" key={name}>
                      {optionLabel(name)}: {value}
                    </span>
                  ))}
            </div>
            {!options && isInstalment(line) && (
              <>
                <span className="product-size plan-line">
                  {t.plan.title}: {chosenPlan(line)!.label}
                  {planStatus && <PlanInfo line={line} status={planStatus} />}
                </span>
                {!planStatus && <PlanSchedule plan={chosenPlan(line)!} commencement={line.commencement} count={line.number} />}
              </>
            )}
            {extra?.(line)}
          </div>
          <div className="cart-price">
            {/* On an instalment plan the row shows what is paid now, with the whole fee beneath. */}
            <span className="price">{formatINR(dueNow(line) * line.number)}</span>
            {isInstalment(line) && <span className="unit-price">{t.plan.overallFee(formatINR(line.unitPrice * line.number))}</span>}
            {/* The price of one, wherever the row can hold several. */}
            {!isSingle(line) && <span className="unit-price">{t.cart.each(formatINR(line.unitPrice))}</span>}
            {underPrice?.(line)}
          </div>
          {action?.(line)}
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
            <span>
              {item.title ?? item.itemId}
              {typeof item.percent === 'number' && <em> ({item.percent}%)</em>}
            </span>
            <span>{formatINR(item.value)}</span>
          </span>
        ))}
      </span>
    </span>
  )
}

/** Subtotal, discounts, taxes, extras and total, as computed by the server. */
export function SummaryLines({ summary, totalLabel = t.cart.total }: { summary: Summary; totalLabel?: string }) {
  return (
    <div className="cartSummary">
      <div className="summary-item">
        <span>{t.cart.subtotal}</span>
        {/* The sum of the row amounts: on an instalment plan, the part paid later is left out. */}
        <span>{formatINR(summary.subTotal - (summary.payLater ?? 0))}</span>
      </div>
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
