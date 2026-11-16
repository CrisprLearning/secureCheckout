// In-browser demo backend, used when VITE_API_BASE_URL is not set.
// It keeps everything in localStorage so the whole purchase flow can be exercised without a server.
// It is NOT a security boundary: the real rules (prices, signatures, sessions) belong to the backend.

import { ApiError } from './types'
import type { Api, Billing, CartRequest, ItemType, Order, Student, VerifiedCart, VerifiedLine } from './types'

export const DEMO_OTP = '1234'
export const DEMO_COUPON = 'CRISPR10'
export const DEMO_KEY_ID = 'demo'
const UNSERVICEABLE_PIN = '999999'
const DELIVERY_CHARGE = 8000
const STORE_KEY = 'crispr-checkout-demo'

interface DemoItem {
  code: string
  type: ItemType
  title: string
  sellingPrice: number
  portalRef: string
  onSale: boolean
  unlocks?: string[]
}

// Placeholder catalogue. Item codes and the book prices are stand-ins until the owner supplies them (Q4).
const CATALOGUE: DemoItem[] = [
  {
    code: 'CR0001',
    type: 'Course',
    title: 'IAT 2027 Exclusive 1 Year Course (Online)',
    sellingPrice: 2999000,
    portalRef: 'CR0001',
    onSale: true,
    unlocks: ['TS0001'],
  },
  { code: 'TS0001', type: 'Test Series', title: 'IAT Test Series, 20 mock tests', sellingPrice: 99900, portalRef: '1001', onSale: true },
  { code: 'PY0001', type: 'Test Series', title: 'Previous Year IAT papers, 2017 to 2025', sellingPrice: 19900, portalRef: '1002', onSale: true },
  { code: 'BK0001', type: 'Book', title: 'IAT Printed Book Bundle (placeholder)', sellingPrice: 149900, portalRef: 'BK0001', onSale: true },
  { code: 'BK0002', type: 'Book', title: 'IAT Practice Workbook Set (placeholder)', sellingPrice: 99900, portalRef: 'BK0002', onSale: false },
]

interface Db {
  students: Record<string, Student>
  sessionMobile: string | null
  orders: (Order & { mobile: string })[]
  owned: Record<string, string[]>
  otp: { mobile: string; key: string; attempts: number; expiresAt: number } | null
}

const EMPTY: Db = { students: {}, sessionMobile: null, orders: [], owned: {}, otp: null }

function load(): Db {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) return { ...structuredClone(EMPTY), ...(JSON.parse(raw) as Db) }
  } catch {
    // Storage blocked or corrupt: start empty.
  }
  return structuredClone(EMPTY)
}

function save(db: Db) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(db))
  } catch {
    // Private mode: the demo simply will not survive a reload.
  }
}

const delay = () => new Promise((r) => setTimeout(r, 250))
const findItem = (code: string) => CATALOGUE.find((i) => i.code === code && i.onSale)

function currentStudent(db: Db): Student | null {
  return db.sessionMobile ? (db.students[db.sessionMobile] ?? null) : null
}

function requireStudent(db: Db): Student {
  const s = currentStudent(db)
  if (!s) throw new ApiError('unauthenticated')
  return s
}

/** Recomputes everything from the catalogue; nothing but IDs and counts is taken from the browser. */
function verify(db: Db, student: Student, cart: CartRequest, discountCode: string): VerifiedCart {
  const owned = db.owned[student.mobile] ?? []
  const lines: VerifiedLine[] = []
  for (const line of cart) {
    const item = findItem(line.itemId)
    if (!item || lines.some((l) => l.itemId === item.code)) continue
    // Courses and test series are bought once; books can be bought in any number.
    const number = item.type === 'Book' ? Math.max(1, Math.min(20, Math.floor(line.number) || 1)) : 1
    lines.push({
      itemId: item.code,
      title: item.title,
      type: item.type,
      unitPrice: item.sellingPrice,
      number,
      portalRef: item.portalRef,
      owned: item.type !== 'Book' && owned.includes(item.code),
    })
  }
  const payable = lines.filter((l) => !l.owned)
  const subTotal = payable.reduce((sum, l) => sum + l.unitPrice * l.number, 0)
  const applied = discountCode.trim().toUpperCase() === DEMO_COUPON && subTotal > 0
  const discount = { code: applied ? DEMO_COUPON : '', amount: applied ? Math.round(subTotal * 0.1) : 0 }
  const extras = payable.some((l) => l.type === 'Book') ? [{ label: 'Delivery', value: DELIVERY_CHARGE }] : []
  const totalPayable = subTotal - discount.amount + extras.reduce((sum, e) => sum + e.value, 0)
  return { cart: lines, summary: { subTotal, discount, taxes: [], extras, totalPayable } }
}

function strip(order: Order & { mobile: string }): Order {
  const { mobile: _mobile, ...rest } = order
  return rest
}

export function createMockApi(): Api {
  return {
    async getSession() {
      await delay()
      return currentStudent(load())
    },

    async requestOtp(mobile) {
      await delay()
      const db = load()
      const key = crypto.randomUUID()
      db.otp = { mobile, key, attempts: 0, expiresAt: Date.now() + 5 * 60_000 }
      save(db)
      return { key }
    },

    async verifyOtp(mobile, otp, key) {
      await delay()
      const db = load()
      const pending = db.otp
      if (!pending || pending.mobile !== mobile || pending.key !== key || Date.now() > pending.expiresAt) {
        throw new ApiError('otp_expired')
      }
      if (pending.attempts >= 5) throw new ApiError('otp_locked')
      if (otp !== DEMO_OTP) {
        pending.attempts += 1
        save(db)
        throw new ApiError('otp_invalid')
      }
      db.otp = null
      db.students[mobile] ??= { id: crypto.randomUUID(), mobile }
      db.sessionMobile = mobile
      save(db)
      return db.students[mobile]
    },

    async logout() {
      await delay()
      const db = load()
      db.sessionMobile = null
      save(db)
    },

    async lookupItem(code) {
      await delay()
      const item = findItem(code)
      if (!item) throw new ApiError('item_unavailable')
      return { code: item.code, type: item.type, title: item.title, sellingPrice: item.sellingPrice }
    },

    async validateCart(cart, discountCode) {
      await delay()
      const db = load()
      return verify(db, requireStudent(db), cart, discountCode)
    },

    async createOrder(req) {
      await delay()
      const db = load()
      const student = requireStudent(db)
      const verified = verify(db, student, req.cart, req.discountCode)
      const items = verified.cart.filter((l) => !l.owned)
      if (items.length === 0) throw new ApiError(verified.cart.length ? 'already_owned' : 'item_unavailable')
      if (verified.summary.totalPayable !== req.expectedTotal) throw new ApiError('price_changed')
      const hasBooks = items.some((l) => l.type === 'Book')
      if (hasBooks && req.billing.pincode === UNSERVICEABLE_PIN) throw new ApiError('pin_unserviceable')

      const billing: Billing = { ...req.billing }
      student.name = billing.fullname
      student.billing = billing

      // Pay tapped twice: reuse the open order for the same cart and amount.
      const signature = JSON.stringify(items.map((l) => [l.itemId, l.number]))
      let order = db.orders.find(
        (o) =>
          o.mobile === student.mobile &&
          o.status === 'CREATED' &&
          o.summary.totalPayable === verified.summary.totalPayable &&
          JSON.stringify(o.items.map((l) => [l.itemId, l.number])) === signature,
      )
      if (!order) {
        order = {
          id: crypto.randomUUID(),
          orderNumber: `CRO-${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`,
          mobile: student.mobile,
          items,
          summary: verified.summary,
          billing,
          status: 'CREATED',
          createdAt: new Date().toISOString(),
        }
        db.orders.push(order)
      }
      order.billing = billing
      if (hasBooks) order.shipment = { status: 'placed' }
      save(db)
      return {
        order: strip(order),
        razorpay: {
          keyId: DEMO_KEY_ID,
          orderId: `order_demo_${order.id.slice(0, 8)}`,
          amount: order.summary.totalPayable,
          currency: 'INR',
        },
      }
    },

    async verifyPayment(proof) {
      await delay()
      const db = load()
      const student = requireStudent(db)
      const order = db.orders.find((o) => o.id === proof.orderId && o.mobile === student.mobile)
      if (!order) throw new ApiError('not_found')
      if (order.status === 'CREATED') {
        order.status = 'PAID'
        order.paidAt = new Date().toISOString()
        order.paymentRef = proof.razorpayPaymentId
        const granted = order.items.flatMap((l) => [
          l.itemId,
          ...(CATALOGUE.find((i) => i.code === l.itemId)?.unlocks ?? []),
        ])
        db.owned[student.mobile] = [...new Set([...(db.owned[student.mobile] ?? []), ...granted])]
        save(db)
      }
      return strip(order)
    },

    async getOrder(id) {
      await delay()
      const db = load()
      const student = requireStudent(db)
      const order = db.orders.find((o) => o.id === id && o.mobile === student.mobile)
      if (!order) throw new ApiError('not_found')
      return strip(order)
    },

    async listOrders() {
      await delay()
      const db = load()
      const student = requireStudent(db)
      return db.orders
        .filter((o) => o.mobile === student.mobile)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(strip)
    },

    async createHandoff() {
      await delay()
      requireStudent(load())
      // Not a real key: the Portal will ignore it and show its own login (FR-K6).
      return { key: `demo-${crypto.randomUUID()}` }
    },
  }
}
