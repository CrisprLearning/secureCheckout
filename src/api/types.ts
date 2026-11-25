// Shapes exchanged with the Crispr candidate APIs (the same PHP endpoints the candidate portal's checkout uses).
// Money is always in paise.

/** 'Course', 'Test Series', 'Book' or 'Merchandise'; kept open so a new catalogue type does not break the cart. */
export type ItemType = string

/** One choice to make about an item. `name` is the catalogue's key ("size") and is what the order records. */
export interface ItemOption {
  name: string
  values: string[]
}

export interface Installment {
  label: string
  amount: number
  /** '' = paid at checkout; otherwise days before (-) or after (+) the reference date. */
  dueDate: string
  /** 'DOJ' (date of joining: the day of purchase) or 'DOC' (date of commencement). */
  dueDateReference: string
}

/** One way to pay for an item: 'FULL', or 'INSTALLMENT' with part of the price paid later. */
export interface PaymentPlan {
  type: string
  label: string
  installments: Installment[]
}

/** A catalogue entry, as returned by public/courses.php. */
export interface CatalogItem {
  code: string
  type: ItemType
  title: string
  sellingPrice: number
  photo?: string
  /** A printed book: it is delivered to the billing address. */
  isBook: boolean
  /** Merchandise such as a tee shirt: delivered too, and may need a choice such as a size. */
  isMerch: boolean
  /** Choices the buyer must make, from the catalogue's otherDetails (for example Size: S, M, L). */
  options: ItemOption[]
  /** Ways to pay, in the catalogue's order of priority. Empty when the item has no payment plan. */
  plans: PaymentPlan[]
  /** When the course starts ("5 April, 2025"), for instalments due relative to it. */
  commencement?: string
  /** Display names of this item's taxes and extra charges, by charge code (for example SHIPPING: 'Delivery Charges'). */
  chargeLabels: Record<string, string>
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
  isBook?: boolean
  isMerch?: boolean
  chargeLabels?: Record<string, string>
  /** Kept in the browser to draw the pickers. */
  choices?: ItemOption[]
  /** What the buyer picked, by option name ({ size: 'M' }). Sent with the order and stored with it. */
  options?: Record<string, string>
  plans?: PaymentPlan[]
  commencement?: string
  /** The type of the plan the buyer picked. Sent with the order; the server works out what is charged. */
  plan?: string
}

/** A tax or extra charge of the order. `items` is how much each cart item adds to it, when the server sends the split. */
export interface ChargeRow {
  label: string
  value: number
  /** `percent` is the rate of a percentage charge (18 for 18%); a fixed charge has none. */
  items?: { itemId: string; value: number; title?: string; percent?: number }[]
}

export interface Summary {
  subTotal: number
  discount: { code: string; amount: number }
  taxes: ChargeRow[]
  extras: ChargeRow[]
  totalPayable: number
  /** Part of the subtotal that is paid after checkout, on an instalment plan. */
  payLater?: number
  giftCodeAllowed?: boolean
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
