import { formatINR } from '../lib/format'
import type { PaymentResult } from '../lib/razorpay'

// Stands in for Razorpay Checkout when the app runs against the demo backend. Never shown with a real backend.
export function DemoPaymentSheet({ amount, onResult }: { amount: number; onResult: (r: PaymentResult) => void }) {
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="demo-pay-title">
        <h2 id="demo-pay-title">Demo payment</h2>
        <p>
          This stands in for Razorpay. No money moves. Choose how the payment of <strong>{formatINR(amount)}</strong>{' '}
          should end.
        </p>
        <button
          className="continue-btn"
          type="button"
          onClick={() =>
            onResult({
              status: 'success',
              razorpayOrderId: 'order_demo',
              razorpayPaymentId: `pay_demo_${Date.now().toString(36)}`,
              razorpaySignature: 'demo',
            })
          }
        >
          Simulate success
        </button>
        <button
          className="apply-btn"
          type="button"
          onClick={() => onResult({ status: 'failed', reason: 'the bank declined the payment' })}
        >
          Simulate failure
        </button>
        <button className="apply-btn" type="button" onClick={() => onResult({ status: 'dismissed' })}>
          Cancel payment
        </button>
      </div>
    </div>
  )
}
