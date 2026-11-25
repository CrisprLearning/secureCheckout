// The candidate session token, in the `crispriteUserToken` cookie for seven days.
//
// On crisprlearning.com the cookie is set for the whole domain, so this site and the candidate portal
// (candidate.crisprlearning.com) share one login: a student logged in on the portal arrives here already
// logged in, and one who logs in here is logged in on the portal after paying. Logging out of either logs
// out of both. The portal's src/lib/auth.js does the same: keep the two alike.
// VITE_SHARED_LOGIN_COOKIE=false, or any other host (localhost), keeps the cookie on this host alone.

import { SHARED_LOGIN_DOMAIN } from '../config'

const TOKEN_COOKIE = 'crispriteUserToken'
const DAYS = 7

const onSharedDomain = (): boolean =>
  SHARED_LOGIN_DOMAIN !== null && window.location.hostname.endsWith(SHARED_LOGIN_DOMAIN.replace(/^\./, ''))

function scope(shared: boolean): string {
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  return `; path=/; SameSite=Lax${secure}${shared ? `; domain=${SHARED_LOGIN_DOMAIN}` : ''}`
}

function write(token: string, shared: boolean) {
  const expires = new Date(Date.now() + DAYS * 24 * 60 * 60 * 1000).toUTCString()
  document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(token)}; expires=${expires}${scope(shared)}`
}

function expire(shared: boolean) {
  document.cookie = `${TOKEN_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 UTC${scope(shared)}`
}

/** Every value the browser holds under the name: one for this host alone and one for the domain can coexist. */
function readAll(): string[] {
  return document.cookie
    .split('; ')
    .filter((part) => part.startsWith(`${TOKEN_COOKIE}=`))
    .map((part) => decodeURIComponent(part.slice(TOKEN_COOKIE.length + 1)))
    .filter(Boolean)
}

// Logins made before the cookie was shared belong to this host alone. Such a cookie is dropped: if a shared
// login exists it wins (it is the newer one, and the portal's candidate when coming from there), otherwise
// the old login is kept by re-saving it as the shared cookie.
function adoptSharedLogin() {
  if (!onSharedDomain()) return
  const before = readAll()
  if (before.length === 0) return
  expire(false)
  if (readAll().length === 0) write(before[0], true)
}
adoptSharedLogin()

export function getToken(): string {
  return readAll()[0] ?? ''
}

export function setToken(token: string) {
  const shared = onSharedDomain()
  if (shared) expire(false)
  write(token, shared)
}

export function clearToken() {
  expire(false)
  if (onSharedDomain()) expire(true)
}
