// Shopping cart kept in localStorage, the same way the candidate portal's checkout keeps it.
// It can hold several items. Courses and test series are limited to one each; books and merchandise can have several copies.
// The server checks every stored price against its catalogue before it prices or charges anything.

import type { CartLine, CatalogItem, Summary } from '../api/types'

const CART_KEY = 'crisprCart'
const CODE_KEY = 'crisprCartDiscountCode'

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage blocked: the cart lasts for this page view only.
  }
}

export function retrieveCart(): CartLine[] {
  try {
    const parsed: unknown = JSON.parse(read(CART_KEY) || '[]')
    return Array.isArray(parsed) ? (parsed as CartLine[]) : []
  } catch {
    return []
  }
}

export function saveCart(lines: CartLine[]) {
  write(CART_KEY, JSON.stringify(lines))
}

export function addToCart(item: CatalogItem): CartLine[] {
  forgetCouponCode()
  const cart = retrieveCart()
  const found = cart.find((line) => line.itemId === item.code)
  if (found) {
    if (found.type !== 'Course' && found.type !== 'Test Series') found.number += 1
  } else {
    cart.push({
      itemId: item.code,
      title: item.title,
      type: item.type,
      unitPrice: item.sellingPrice,
      number: 1,
      displayImage: item.photo,
      isBook: item.isBook,
      isMerch: item.isMerch,
      chargeLabels: item.chargeLabels,
      choices: item.options,
      plans: item.plans,
      commencement: item.commencement,
    })
  }
  saveCart(cart)
  return cart
}

export const MAX_QUANTITY = 10

/** "size" -> "Size", for display. */
export const optionLabel = (name: string) => name.charAt(0).toUpperCase() + name.slice(1)

/** Changes how many copies of a book or merchandise item are in the cart, within 1 to MAX_QUANTITY. Other items stay at one. */
export function setQuantity(itemId: string, number: number): CartLine[] {
  const cart = retrieveCart()
  const line = cart.find((l) => l.itemId === itemId)
  if (line && isDelivered(line)) line.number = Math.min(MAX_QUANTITY, Math.max(1, Math.round(number)))
  saveCart(cart)
  return cart
}

/** Books and merchandise are sent to the billing address. */
export const isDelivered = (line: CartLine) => !!line.isBook || !!line.isMerch

/** Records the buyer's pick for one option of a line (size: M). */
export function setOption(itemId: string, name: string, value: string): CartLine[] {
  const cart = retrieveCart()
  const line = cart.find((l) => l.itemId === itemId)
  if (line?.choices?.some((c) => c.name === name && c.values.includes(value))) {
    line.options = { ...line.options, [name]: value }
  }
  saveCart(cart)
  return cart
}

/** Puts a line on one of the payment plans the catalogue offers for it. */
export function setPlan(itemId: string, type: string): CartLine[] {
  const cart = retrieveCart()
  const line = cart.find((l) => l.itemId === itemId)
  if (line?.plans?.some((p) => p.type === type)) line.plan = type
  saveCart(cart)
  return cart
}

/** The first choice still to be made in the cart, if any. Picks that the catalogue no longer offers count as not made. */
export function missingOption(lines: CartLine[]): { line: CartLine; name: string } | null {
  for (const line of lines) {
    for (const c of line.choices ?? []) {
      if (!c.values.includes(line.options?.[c.name] ?? '')) return { line, name: c.name }
    }
  }
  return null
}

/** The server names tax and extra rows by charge code (SHIPPING); this swaps in the catalogue's label (Delivery Charges) and names the items of each row's split. */
export function withChargeLabels(summary: Summary, lines: CartLine[]): Summary {
  const labels: Record<string, string> = Object.assign({}, ...lines.map((line) => line.chargeLabels ?? {}))
  const titles = new Map(lines.map((line) => [line.itemId, line.title]))
  const relabel = (rows: Summary['taxes'] = []) =>
    rows.map((row) => ({
      ...row,
      label: labels[row.label] ?? row.label,
      // The split names items by code; the titles come from the cart.
      items: row.items?.map((item) => ({ ...item, title: titles.get(item.itemId) ?? item.itemId })),
    }))
  return { ...summary, taxes: relabel(summary.taxes), extras: relabel(summary.extras) }
}

export function removeFromCart(itemId: string): CartLine[] {
  forgetCouponCode()
  const cart = retrieveCart().filter((line) => line.itemId !== itemId)
  saveCart(cart)
  return cart
}

export const getCouponCode = () => read(CODE_KEY)
export const rememberCouponCode = (code: string) => write(CODE_KEY, code)
export const forgetCouponCode = () => write(CODE_KEY, '')

export function clearCheckoutData() {
  try {
    localStorage.removeItem(CART_KEY)
    localStorage.removeItem(CODE_KEY)
  } catch {
    // Nothing to clear.
  }
}
