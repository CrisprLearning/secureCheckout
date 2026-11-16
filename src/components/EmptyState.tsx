import type { ReactNode } from 'react'
import { MAIN_SITE_URL } from '../config'
import { t } from '../strings'

/** Full-page message for an empty cart, an unavailable item or a page that does not exist. */
export function EmptyState({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div className="container">
      <section className="form-section solo empty-state">
        <img className="empty-art" src="/empty-cart.png" alt="" width="959" height="640" />
        <h1>{title}</h1>
        <p className="lead">{body}</p>
        {children ?? (
          <a className="continue-btn" href={MAIN_SITE_URL}>
            {t.cart.emptyLink}
          </a>
        )}
      </section>
    </div>
  )
}
