import { ApiError } from '../api/types'
import { t } from '../strings'

/** Formats paise the way the portal does: 99900 → "₹999.00". */
export function formatINR(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`
}

/** "98XX5XX210", as the portal masks a number on the passcode step. */
export function maskMobile(mobile: string): string {
  const d = mobile.split('')
  for (const i of [2, 3, 5, 6]) d[i] = 'X'
  return d.join('')
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
}

/** Plain-language message for any thrown value (UX-6). */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return t.errors[err.code] ?? t.errors.generic
  return t.errors.generic
}

export const isMobile = (v: string) => /^[6-9]\d{9}$/.test(v)
// Indian PIN codes are 6 digits and the first two name a postal circle. These are the prefixes India Post
// has not assigned: 00-10, 29, 35, 54, 55 and 86-89 (90-99 are the Army Postal Service).
const UNUSED_PIN_PREFIXES = new Set(['10', '29', '35', '54', '55', '86', '87', '88', '89'])
export const isPin = (v: string) => /^[1-9]\d{5}$/.test(v) && !UNUSED_PIN_PREFIXES.has(v.slice(0, 2))
// name@domain.tld: letters, digits and . _ % + - before the @; dot-separated labels and a 2+ letter ending after it.
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/
export const isEmail = (v: string) => EMAIL.test(v) && !v.includes('..')

/** Names: letters only, with single spaces between words. */
export const nameChars = (v: string) => v.replace(/[^A-Za-z ]/g, '').replace(/^ +/, '').replace(/ {2,}/g, ' ')
/** Address lines: letters, digits, spaces and # , @ . - _ */
export const addressChars = (v: string) => v.replace(/[^A-Za-z0-9 #,@.\-_]/g, '').replace(/^ +/, '').replace(/ {2,}/g, ' ')
export const digits = (v: string, max: number) => v.replace(/\D/g, '').slice(0, max)
