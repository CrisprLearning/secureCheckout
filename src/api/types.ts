// Shapes exchanged with the checkout backend. Money is always in paise.
// Names follow the candidate portal's checkout (cart lines, verified cart, summary, billing address).

export type ItemType = 'Course' | 'Test Series' | 'Book'
export type OrderStatus = 'CREATED' | 'PAID' | 'FULFILLED' | 'FAILED' | 'EXPIRED' | 'REFUNDED'
export type ShipmentStatus = 'placed' | 'packed' | 'shipped' | 'delivered'

/** A catalogue entry, as returned by a lookup. */
export interface CatalogItem {
  code: string
  type: ItemType
  title: string
  sellingPrice: number
  photo?: string
}

/** One line of the cart kept in the browser. Prices here are for display only; the server recomputes them. */
export interface CartLine {
  itemId: string
  title: string
  type: ItemType
  unitPrice: number
  number: number
  displayImage?: string
}

/** A cart line after the server has checked it for the logged-in student. */
export interface VerifiedLine extends CartLine {
  /** The ID the Portal uses for this course or exam bundle. */
  portalRef: string
  /** True when the student already owns the item; it is then left out of the total. */
  owned?: boolean
}

export interface Summary {
  subTotal: number
  discount: { code: string; amount: number }
  taxes: { label: string; value: number }[]
  extras: { label: string; value: number }[]
  totalPayable: number
}

export interface VerifiedCart {
  cart: VerifiedLine[]
  summary: Summary
}

export interface Billing {
  fullname: string
  address: string
  locality: string
  city: string
  state: string
  pincode: string
  email: string
}

export interface Student {
  id: string
  mobile: string
  name?: string
  billing?: Partial<Billing>
}

export interface Shipment {
  status: ShipmentStatus
  courier?: string
  trackingNumber?: string
}

export interface Order {
  id: string
  orderNumber: string
  items: VerifiedLine[]
  summary: Summary
  billing: Billing
  status: OrderStatus
  paymentRef?: string
  createdAt: string
  paidAt?: string
  /** Present when the order contains books. */
  shipment?: Shipment
}

export interface RazorpayOrder {
  /** Public key ID only. The key secret never leaves the server. */
  keyId: string
  orderId: string
  amount: number
  currency: 'INR'
}

export interface PaymentProof {
  orderId: string
  razorpayOrderId: string
  razorpayPaymentId: string
  razorpaySignature: string
}

export interface Utm {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  referrer?: string
}

/** What the browser sends for a cart: IDs and counts only, never prices (SEC-2). */
export type CartRequest = { itemId: string; number: number }[]

export interface PurchaseRequest {
  cart: CartRequest
  discountCode: string
  billing: Billing
  /** Only used to detect a price change since the cart was shown. */
  expectedTotal: number
  utm?: Utm
}

export type ApiErrorCode =
  | 'network'
  | 'unauthenticated'
  | 'not_found'
  | 'item_unavailable'
  | 'already_owned'
  | 'price_changed'
  | 'pin_unserviceable'
  | 'otp_invalid'
  | 'otp_expired'
  | 'otp_locked'
  | 'rate_limited'
  | 'generic'

export class ApiError extends Error {
  code: ApiErrorCode
  constructor(code: ApiErrorCode, message?: string) {
    super(message ?? code)
    this.code = code
  }
}

export interface Api {
  getSession(): Promise<Student | null>
  /** Sends the OTP and returns a key that must accompany the verification. */
  requestOtp(mobile: string): Promise<{ key: string }>
  verifyOtp(mobile: string, otp: string, key: string): Promise<Student>
  logout(): Promise<void>

  /** Throws item_unavailable for unknown, inactive or not-yet-on-sale items (UR-4). */
  lookupItem(code: string): Promise<CatalogItem>
  /** Prices, ownership, discount, taxes and total for the logged-in student. Unknown lines are dropped. */
  validateCart(cart: CartRequest, discountCode: string): Promise<VerifiedCart>

  createOrder(req: PurchaseRequest): Promise<{ order: Order; razorpay: RazorpayOrder }>
  verifyPayment(proof: PaymentProof): Promise<Order>
  getOrder(id: string): Promise<Order>
  listOrders(): Promise<Order[]>

  /** Issues a single-use, 60-second key for a Portal redirect (section 7). */
  createHandoff(): Promise<{ key: string }>
}
