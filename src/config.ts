// Site-wide settings. Anything that differs per environment comes from VITE_* variables
// (see .env.example). Nothing secret belongs here: this file ships in the browser bundle.

const env = import.meta.env

export const MAIN_SITE_URL = 'https://crisprlearning.com'
export const TERMS_URL = `${MAIN_SITE_URL}/terms-and-conditions/`
export const REFUND_POLICY_URL = `${MAIN_SITE_URL}/refund-policy/`
export const PRIVACY_POLICY_URL = `${MAIN_SITE_URL}/privacy-policy/`
export const PORTAL_URL: string = (env.VITE_PORTAL_URL || 'https://candidate.crisprlearning.com').replace(/\/+$/, '')

/** The Crispr candidate APIs. Production is the default, as in the candidate portal. */
export const API_BASE_URL: string = (env.VITE_API_BASE || 'https://crisprtech.app/crispr-apis').replace(/\/+$/, '')

/**
 * The login cookie is kept on the whole domain, so this site and the candidate portal share one login.
 * VITE_SHARED_LOGIN_COOKIE=false keeps it on this site alone. See src/lib/auth.ts.
 */
export const SHARED_LOGIN_DOMAIN: string | null = env.VITE_SHARED_LOGIN_COOKIE === 'false' ? null : '.crisprlearning.com'

/**
 * The cart lives in this site's localStorage, which the main site (crisprlearning.com) cannot read. The number
 * of items in it is therefore also kept in a cookie on the whole domain, for the main site's cart icon.
 * See src/lib/cart.ts.
 */
export const CART_COUNT_COOKIE = 'crisprCartCount'
export const CART_COUNT_DOMAIN = '.crisprlearning.com'

export const SUPPORT_PHONE = '9809677798'
export const SUPPORT_EMAIL = 'support@crisprlearning.com'

export const OTP_LENGTH = 4
export const OTP_RESEND_SECONDS = 30
