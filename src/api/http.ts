// Client for a checkout backend. The session is an HttpOnly cookie, so every request sends
// credentials and no token is held in JS.

import { ApiError } from './types'
import type { Api, ApiErrorCode, CatalogItem, Order, RazorpayOrder, Student, VerifiedCart } from './types'

const KNOWN_CODES: ApiErrorCode[] = [
  'unauthenticated',
  'not_found',
  'item_unavailable',
  'already_owned',
  'price_changed',
  'pin_unserviceable',
  'otp_invalid',
  'otp_expired',
  'otp_locked',
  'rate_limited',
]

export function createHttpApi(baseUrl: string): Api {
  const root = baseUrl.replace(/\/+$/, '')

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response
    try {
      res = await fetch(root + path, {
        method,
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          // A custom header forces a CORS preflight, which is part of the CSRF defence (SEC-5).
          'X-Requested-With': 'crispr-checkout',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw new ApiError('network')
    }
    if (res.status === 204) return undefined as T
    const data: unknown = await res.json().catch(() => null)
    if (!res.ok) {
      const code = (data as { code?: string } | null)?.code
      if (code && (KNOWN_CODES as string[]).includes(code)) throw new ApiError(code as ApiErrorCode)
      if (res.status === 401) throw new ApiError('unauthenticated')
      if (res.status === 404) throw new ApiError('not_found')
      if (res.status === 429) throw new ApiError('rate_limited')
      throw new ApiError('generic')
    }
    return data as T
  }

  const id = encodeURIComponent

  return {
    getSession: () => call<{ student: Student | null }>('GET', '/api/session').then((r) => r.student),
    requestOtp: (mobile) => call<{ key: string }>('POST', '/api/auth/otp/request', { mobile }),
    verifyOtp: (mobile, otp, key) =>
      call<{ student: Student }>('POST', '/api/auth/otp/verify', { mobile, otp, key }).then((r) => r.student),
    logout: () => call('POST', '/api/auth/logout'),

    lookupItem: (code) => call<{ item: CatalogItem }>('GET', `/api/items/${id(code)}`).then((r) => r.item),
    validateCart: (cart, discountCode) => call<VerifiedCart>('POST', '/api/cart/validate', { cart, discountCode }),

    createOrder: (req) => call<{ order: Order; razorpay: RazorpayOrder }>('POST', '/api/orders', req),
    verifyPayment: (proof) =>
      call<{ order: Order }>('POST', '/api/payments/verify', proof).then((r) => r.order),
    getOrder: (orderId) => call<{ order: Order }>('GET', `/api/orders/${id(orderId)}`).then((r) => r.order),
    listOrders: () => call<{ orders: Order[] }>('GET', '/api/orders').then((r) => r.orders),

    createHandoff: () => call<{ key: string }>('POST', '/api/handoff'),
  }
}
