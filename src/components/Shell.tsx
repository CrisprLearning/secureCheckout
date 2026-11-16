import type { ReactNode } from 'react'
import { IS_DEMO, MAIN_SITE_URL } from '../config'
import { t } from '../strings'

// Page frame shared by every screen: centred logo and "Secure checkout", as on the candidate portal.
export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="cp-checkout">
      {IS_DEMO && (
        <p className="demo-banner" role="status">
          {t.demoBanner}
        </p>
      )}
      <header className="header">
        <a href={MAIN_SITE_URL}>
          <img src="/logo/crispr-logo.svg" alt={t.logoAlt} width="150" height="40" />
        </a>
        <small>{t.secure}</small>
      </header>
      {children}
    </div>
  )
}

/** A single centred white panel, for confirmation, orders and messages. */
export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className="container">
      <section className={`form-section solo ${className}`}>{children}</section>
    </div>
  )
}

export function LoaderScreen() {
  return <div className="loaderScreen">{t.loading}</div>
}

export function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M9 7V4h6v3" />
    </svg>
  )
}
