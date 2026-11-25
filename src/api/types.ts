// Shapes exchanged with the Crispr candidate APIs (the same PHP endpoints the candidate portal's checkout uses).
// Money is always in paise.

/** 'Course' or 'Test Series' today; kept open so a new catalogue type does not break the cart. */
export type ItemType = string

/** A catalogue entry, as returned by public/courses.php. */
export interface CatalogItem {
  code: string
  type: ItemType
  title: string
  sellingPrice: number
  photo?: string
}

/**
 * One line of the cart. It is kept in the browser and sent to the server as is; the server rejects the
 * whole cart if a unit price does not match its catalogue, so a stored price can never lower the charge.
 */
export interface CartLine {
  itemId: string
  title: string
  type: ItemType
  unitPrice: number
  number: number
  displayImage?: string
}

export interface Summary {
  subTotal: number
  discount: { code: string; amount: number }
  taxes: { label: string; value: number }[]
  extras: { label: string; value: number }[]
  totalPayable: number
}

export interface VerifiedCart {
  cart: CartLine[]
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

/** The logged-in candidate, as far as checkout needs to know them. */
export interface Student {
  mobile: string
  name: string
  /** Address from their last purchase, used to pre-fill the billing form. */
  billing: Partial<Billing>
}

/** What process-purchase.php returns: everything Razorpay Checkout needs to open. */
export interface PaymentOrder {
  /** Razorpay public key ID. */
  key: string
  /** Razorpay order ID. */
  order: string
  amount: number
  /** Crispr's own order number. */
  transactionId: string
}

export interface PaymentProof {
  razorpayOrderId: string
  razorpayPaymentId: string
  razorpaySignature: string
}

export type ApiErrorCode = 'network' | 'unauthenticated' | 'item_unavailable' | 'server'

export class ApiError extends Error {
  code: ApiErrorCode
  /** True when `message` is the server's own wording and can be shown to the student. */
  fromServer: boolean
  constructor(code: ApiErrorCode, message?: string) {
    super(message ?? code)
    this.code = code
    this.fromServer = message !== undefined
  }
}
