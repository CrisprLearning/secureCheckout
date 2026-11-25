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

/** A row id not yet used in the cart: the item's code, then code~2, code~3 for further rows of the same item. */
function newLineId(lines: CartLine[], itemId: string): string {
  const used = new Set(lines.map((l) => l.lineId))
  let id = itemId
  for (let n = 2; used.has(id); n += 1) id = `${itemId}~${n}`
  return id
}

/** The id of a cart row, for rows that came from somewhere other than the stored cart. */
export const rowId = (line: CartLine) => line.lineId ?? line.itemId

/**
 * The picks named in a link: /cart?addItem=M001&selection=M. With several options the values are separated
 * by commas, in the catalogue's order (selection=M,Black). Returns nothing unless every value is one the item offers.
 */
function picksFrom(item: CatalogItem, selection: string | null): Record<string, string> | undefined {
  const values = (selection ?? '').split(',').map((v) => v.trim())
  if (item.options.length === 0 || values.length !== item.options.length) return undefined
  const picks: Record<string, string> = {}
  for (const [i, option] of item.options.entries()) {
    const match = option.values.find((v) => v.toLowerCase() === values[i].toLowerCase())
    if (!match) return undefined
    picks[option.name] = match
  }
  return picks
}

/** True when two rows of one item carry the same picks (both unpicked counts as the same). */
const samePicks = (a: Record<string, string> = {}, b: Record<string, string> = {}) =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])].every((name) => (a[name] ?? '') === (b[name] ?? ''))

export function retrieveCart(): CartLine[] {
  try {
    const parsed: unknown = JSON.parse(read(CART_KEY) || '[]')
    const lines = Array.isArray(parsed) ? (parsed as CartLine[]) : []
    // Rows saved before rows had ids get one now.
    for (const line of lines) line.lineId ??= newLineId(lines, line.itemId)
    return lines
  } catch {
    return []
  }
}

export function saveCart(lines: CartLine[]) {
  write(CART_KEY, JSON.stringify(lines))
}

/**
 * Adds an item, with the picks named in the link if any. An item already in the cart with the same picks
 * gains a copy (courses and test series stay at one); with different picks it becomes a row of its own.
 */
export function addToCart(item: CatalogItem, selection: string | null = null): CartLine[] {
  forgetCouponCode()
  const cart = retrieveCart()
  const picks = picksFrom(item, selection)
  const found = cart.find((line) => line.itemId === item.code && samePicks(line.options, picks))
  if (found) {
    if (found.type !== 'Course' && found.type !== 'Test Series') found.number = Math.min(MAX_QUANTITY, found.number + 1)
  } else {
    cart.push({
      lineId: newLineId(cart, item.code),
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
      ...(picks ? { options: picks } : {}),
    })
  }
  saveCart(cart)
  return cart
}

export const MAX_QUANTITY = 10

/** "size" -> "Size", for display. */
export const optionLabel = (name: string) => name.charAt(0).toUpperCase() + name.slice(1)

/** Changes how many copies of a book or merchandise item are in the cart, within 1 to MAX_QUANTITY. Other items stay at one. */
export function setQuantity(lineId: string, number: number): CartLine[] {
  const cart = retrieveCart()
  const line = cart.find((l) => l.lineId === lineId)
  if (line && isDelivered(line)) line.number = Math.min(MAX_QUANTITY, Math.max(1, Math.round(number)))
  saveCart(cart)
  return cart
}

/** Books and merchandise are sent to the billing address. */
export const isDelivered = (line: CartLine) => !!line.isBook || !!line.isMerch

/**
 * Records the buyer's pick for one option of a row (size: M). If that makes the row the same as another
 * row of the item, the two become one row with the copies added together.
 */
export function setOption(lineId: string, name: string, value: string): CartLine[] {
  let cart = retrieveCart()
  const line = cart.find((l) => l.lineId === lineId)
  if (line?.choices?.some((c) => c.name === name && c.values.includes(value))) {
    line.options = { ...line.options, [name]: value }
    const twin = cart.find((l) => l !== line && l.itemId === line.itemId && samePicks(l.options, line.options))
    if (twin) {
      twin.number = Math.min(MAX_QUANTITY, twin.number + line.number)
      cart = cart.filter((l) => l !== line)
    }
  }
  saveCart(cart)
  return cart
}

/** Puts a line on one of the payment plans the catalogue offers for it. */
export function setPlan(lineId: string, type: string): CartLine[] {
  const cart = retrieveCart()
  const line = cart.find((l) => l.lineId === lineId)
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

export function removeFromCart(lineId: string): CartLine[] {
  forgetCouponCode()
  const cart = retrieveCart().filter((line) => line.lineId !== lineId)
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
