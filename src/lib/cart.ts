// Shopping cart kept in localStorage, the same way the candidate portal's checkout keeps it.
// It can hold several items. Courses and test series are limited to one each; books add to their count.
// Prices stored here are only for display before login: the server recomputes everything.

import type { CartLine, CatalogItem, VerifiedLine } from '../api/types'

const CART_KEY = 'crisprCart'
const CODE_KEY = 'crisprCartDiscountCode'
const MAX_COUNT = 20

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

/** Keeps the stored cart in step with what the server verified (prices, dropped items). */
export function syncCart(lines: VerifiedLine[]) {
  saveCart(lines.map(({ itemId, title, type, unitPrice, number, displayImage }) => ({ itemId, title, type, unitPrice, number, displayImage })))
}

export function addToCart(item: CatalogItem): CartLine[] {
  forgetCouponCode()
  const cart = retrieveCart()
  const found = cart.find((line) => line.itemId === item.code)
  if (found) {
    if (found.type === 'Book') found.number = Math.min(MAX_COUNT, found.number + 1)
  } else {
    cart.push({ itemId: item.code, title: item.title, type: item.type, unitPrice: item.sellingPrice, number: 1, displayImage: item.photo })
  }
  saveCart(cart)
  return cart
}

export function setCount(itemId: string, number: number): CartLine[] {
  const cart = retrieveCart()
  const found = cart.find((line) => line.itemId === itemId)
  if (found && found.type === 'Book') found.number = Math.max(1, Math.min(MAX_COUNT, number))
  saveCart(cart)
  return cart
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
