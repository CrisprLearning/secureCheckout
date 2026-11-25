// Opens Razorpay Checkout. Only the public key ID and the Razorpay order ID are used here;
// the result is always verified by the server before anything is shown as paid.

import type { PaymentOrder } from '../api/types'
import { t } from '../strings'

export type PaymentResult =
  | { status: 'success'; razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }
  | { status: 'dismissed' }
  | { status: 'failed'; reason?: string }

interface RazorpaySuccess {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

interface RazorpayInstance {
  open(): void
  on(event: 'payment.failed', handler: (r: { error?: { description?: string } }) => void): void
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance
  }
}

const SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js'
let scriptPromise: Promise<void> | null = null

function loadScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve()
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const el = document.createElement('script')
    el.src = SCRIPT_URL
    el.onload = () => resolve()
    el.onerror = () => {
      scriptPromise = null
      el.remove()
      reject(new Error('razorpay script failed to load'))
    }
    document.head.appendChild(el)
  })
  return scriptPromise
}

export async function openRazorpay(
  order: PaymentOrder,
  info: { description: string; name?: string; mobile: string; email?: string },
): Promise<PaymentResult> {
  await loadScript()
  return new Promise<PaymentResult>((resolve) => {
    let lastFailure: string | undefined
    let failed = false
    const checkout = new window.Razorpay!({
      key: order.key,
      order_id: order.order,
      amount: order.amount,
      currency: 'INR',
      notes: { 'Crispr Order #': order.transactionId },
      name: t.brand,
      description: info.description,
      prefill: { name: info.name, contact: `+91${info.mobile}`, email: info.email },
      image: `${window.location.origin}/logo/crispr-logo.svg`,
      theme: { color: '#016375' },
      handler: (r: RazorpaySuccess) =>
        resolve({
          status: 'success',
          razorpayOrderId: r.razorpay_order_id,
          razorpayPaymentId: r.razorpay_payment_id,
          razorpaySignature: r.razorpay_signature,
        }),
      modal: {
        // Razorpay keeps its window open after a failed attempt so the student can retry inside it.
        // We only report the failure once they close the window.
        ondismiss: () => resolve(failed ? { status: 'failed', reason: lastFailure } : { status: 'dismissed' }),
      },
    })
    checkout.on('payment.failed', (r) => {
      failed = true
      lastFailure = r.error?.description
    })
    checkout.open()
  })
}
