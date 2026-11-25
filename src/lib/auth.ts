// The candidate session token. It is kept in the `crispriteUserToken` cookie for seven days, the same name
// and lifetime the candidate portal uses.
//
// With VITE_SHARED_LOGIN_COOKIE=true the cookie is set for the whole crisprlearning.com domain, so a student
// who logs in here is already logged in on the portal after paying. Turn it on only once the portal's logout
// also clears the domain-wide cookie; until then its logout would leave this cookie behind.

import { SHARED_LOGIN_DOMAIN } from '../config'

const TOKEN_COOKIE = 'crispriteUserToken'
const DAYS = 7

function cookieScope(): string {
  const shared = SHARED_LOGIN_DOMAIN && window.location.hostname.endsWith(SHARED_LOGIN_DOMAIN.replace(/^\./, ''))
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  return `; path=/; SameSite=Lax${secure}${shared ? `; domain=${SHARED_LOGIN_DOMAIN}` : ''}`
}

export function getToken(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${TOKEN_COOKIE}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : ''
}

export function setToken(token: string) {
  const expires = new Date(Date.now() + DAYS * 24 * 60 * 60 * 1000).toUTCString()
  document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(token)}; expires=${expires}${cookieScope()}`
}

export function clearToken() {
  document.cookie = `${TOKEN_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 UTC${cookieScope()}`
}
