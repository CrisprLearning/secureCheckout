// Shopping cart kept in localStorage, the same way the candidate portal's checkout keeps it.
// It can hold several items. Courses and test series are limited to one each; any other type adds to its count.
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
      chargeLabels: item.chargeLabels,
    })
  }
  saveCart(cart)
  return cart
}

export const hasBooks = (lines: CartLine[]) => lines.some((line) => line.isBook)

/** The server names tax and extra rows by charge code (SHIPPING); this swaps in the catalogue's label (Delivery Charges). */
export function withChargeLabels(summary: Summary, lines: CartLine[]): Summary {
  const labels: Record<string, string> = Object.assign({}, ...lines.map((line) => line.chargeLabels ?? {}))
  const relabel = (rows: Summary['taxes'] = []) => rows.map((row) => ({ ...row, label: labels[row.label] ?? row.label }))
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
