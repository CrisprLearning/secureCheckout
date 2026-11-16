// Site-wide settings. Anything that differs per environment comes from VITE_* variables
// (see .env.example). Nothing secret belongs here: this file ships in the browser bundle.

const env = import.meta.env

export const MAIN_SITE_URL = 'https://crisprlearning.com'
export const TERMS_URL = `${MAIN_SITE_URL}/terms-and-conditions/`
export const REFUND_POLICY_URL = `${MAIN_SITE_URL}/refund-policy/`
export const PRIVACY_POLICY_URL = `${MAIN_SITE_URL}/privacy-policy/`
export const PORTAL_URL = env.VITE_PORTAL_URL ?? 'https://candidate.crisprlearning.com'

/** Base URL of the checkout backend. When unset the app runs against the in-browser demo backend. */
export const API_BASE_URL: string | undefined = env.VITE_API_BASE_URL || undefined
export const IS_DEMO = !API_BASE_URL

/** WhatsApp help number in international format without "+", for example 919876543210. */
const whatsappNumber: string | undefined = env.VITE_WHATSAPP_NUMBER || undefined
export const HELP_URL = whatsappNumber ? `https://wa.me/${whatsappNumber}` : `${MAIN_SITE_URL}/contact/`

export const SUPPORT_PHONE = '9809677798'
export const SUPPORT_EMAIL = 'support@crisprlearning.com'

export const OTP_LENGTH = 4
export const OTP_RESEND_SECONDS = 30
