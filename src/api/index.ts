// Client for the Crispr candidate APIs: the PHP scripts the candidate portal's checkout already uses.
//
//   public/courses.php?code=            catalogue lookup
//   user/authenticate.php               send the one-time passcode
//   user/login.php                      verify it and receive the session token
//   user/get-billing-address.php        who is logged in, and their last billing address
//   user/checkout/validate-user-cart.php    price the cart (discount, taxes, extras, total)
//   user/checkout/process-purchase.php      create the order and the Razorpay order
//   user/checkout/acknowledge-purchase.php  verify the Razorpay signature and enrol the candidate
//
// Every script answers HTTP 200 with { status: "success", data } or { status: "error" | "failed", error | message }.

import { API_BASE_URL } from '../config'
import { clearToken, getToken, setToken } from '../lib/auth'
import { ApiError } from './types'
import type { Billing, CartLine, CatalogItem, PaymentOrder, PaymentProof, Student, VerifiedCart } from './types'

export { ApiError } from './types'
export type * from './types'

interface Envelope {
  status?: unknown
  data?: unknown
  error?: unknown
  message?: unknown
}

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

async function call(path: string, opts: { body?: unknown; auth?: boolean; method?: 'GET' | 'POST' } = {}): Promise<Envelope> {
  const { body, auth = true, method = 'POST' } = opts
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  // The login scripts do not accept an Authorization header, so it is sent only where a session is needed.
  if (auth) headers.Authorization = `Bearer ${getToken()}`

  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
    })
  } catch {
    throw new ApiError('network')
  }

  // A few scripts answer with text/plain, so the body is parsed by hand.
  let envelope: Envelope | null = null
  try {
    const parsed: unknown = JSON.parse(await res.text())
    if (parsed && typeof parsed === 'object') envelope = parsed as Envelope
  } catch {
    // Not JSON: treated as a server fault below.
  }

  if (res.status === 401) throw unauthenticated()
  if (!envelope) throw new ApiError('server')
  if (envelope.status === 'success') return envelope

  const message = text(envelope.error) ?? text(envelope.message)
  // A missing, expired or tampered token is reported in the body, not by the status code.
  if (auth && message && /token/i.test(message)) throw unauthenticated()
  throw new ApiError('server', message)
}

function unauthenticated(): ApiError {
  clearToken()
  return new ApiError('unauthenticated')
}

const clean = (v: unknown) => (typeof v === 'string' && v !== 'undefined' ? v.trim() : '')

export const api = {
  hasToken: () => getToken() !== '',

  /** The logged-in candidate, or null when nobody is logged in or the session has ended. */
  async getSession(): Promise<Student | null> {
    if (!getToken()) return null
    try {
      const { data } = await call('/user/get-billing-address.php', { method: 'GET' })
      const d = (data ?? {}) as Record<string, unknown>
      const name = clean(d.name)
      return {
        mobile: clean(d.mobile),
        // New accounts are given this placeholder name until the candidate fills in their own.
        name: name === 'Crisprite' ? '' : name,
        billing: {
          address: clean(d.address),
          locality: clean(d.locality),
          city: clean(d.city),
          state: clean(d.state),
          pincode: clean(d.pincode),
          email: clean(d.email),
        },
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'unauthenticated') return null
      throw err
    }
  },

  /** Sends the one-time passcode by SMS. The returned key must accompany the passcode. */
  async requestOtp(mobile: string): Promise<{ key: string; message?: string }> {
    const res = await call('/user/authenticate.php', { auth: false, body: { username: mobile } })
    return { key: clean(res.data), message: text(res.message) }
  },

  async verifyOtp(mobile: string, passcode: string, key: string): Promise<Student> {
    const res = await call('/user/login.php', { auth: false, body: { username: mobile, passcode, key } })
    const token = clean(res.data)
    if (!token) throw new ApiError('server')
    setToken(token)
    // The login reply carries only the token; the profile comes from the session call.
    return (await api.getSession()) ?? { mobile, name: '', billing: {} }
  },

  logout() {
    clearToken()
  },

  /** Throws item_unavailable when the code is unknown or the item is no longer on sale. */
  async lookupItem(code: string): Promise<CatalogItem> {
    const res = await call(`/public/courses.php?code=${encodeURIComponent(code)}`, { auth: false })
    const d = res.data as Record<string, unknown> | undefined
    // An unknown code comes back as an empty list rather than an error.
    if (!d || Array.isArray(d) || d.code !== code) throw new ApiError('item_unavailable')
    const charges = (Array.isArray(d.taxDetails) ? d.taxDetails : []) as Record<string, unknown>[]
    const chargeLabels: Record<string, string> = {}
    for (const c of charges) {
      if (clean(c.code) && clean(c.label)) chargeLabels[clean(c.code)] = clean(c.label)
    }
    const type = clean(d.type)
    return {
      code,
      type,
      title: clean(d.title),
      sellingPrice: Number(d.sellingPrice),
      photo: clean(d.photo) || undefined,
      // Books are catalogue type 3. The API names types 1 and 2 only and sends an empty name for a book today,
      // so until it names them, an unnamed item with a shipping charge is taken to be a book.
      isBook: type === 'Book' || type === '3' || (type === '' && charges.some((c) => clean(c.code) === 'SHIPPING')),
      chargeLabels,
    }
  },

  /** Prices the cart for the logged-in candidate: discount, taxes, extras and the total to pay. */
  async validateCart(cart: CartLine[], discountCode: string): Promise<VerifiedCart> {
    const res = await call('/user/checkout/validate-user-cart.php', { body: { cart, code: discountCode } })
    return res.data as VerifiedCart
  },

  /** Creates the order on the server, which computes the amount itself and opens a Razorpay order for it. */
  async createOrder(req: { cart: CartLine[]; discountCode: string; billing: Billing; mobile: string }): Promise<PaymentOrder> {
    const { fullname, ...address } = req.billing
    const res = await call('/user/checkout/process-purchase.php', {
      body: { cart: req.cart, discountCode: req.discountCode, billingAddress: { mobile: req.mobile, name: fullname, ...address } },
    })
    const d = (res.data ?? {}) as Record<string, unknown>
    if (!d.key || !d.order) throw new ApiError('server')
    return { key: String(d.key), order: String(d.order), amount: Number(d.amount), transactionId: String(d.transactionId ?? '') }
  },

  /** The server checks Razorpay's signature and enrols the candidate. Resolves only when it confirms the payment. */
  async acknowledgePayment(order: PaymentOrder, proof: PaymentProof): Promise<void> {
    await call('/user/checkout/acknowledge-purchase.php', {
      body: {
        orderID: order.order,
        transactionID: proof.razorpayPaymentId,
        razorpay_order_id: proof.razorpayOrderId,
        razorpay_signature: proof.razorpaySignature,
      },
    })
  },
}
