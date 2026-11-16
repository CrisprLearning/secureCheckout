import { useState } from 'react'
import type { ItemType } from '../api'
import { goToPortal } from '../lib/portal'
import { t } from '../strings'
import { useToast } from './Toast'

// "Access the Course" / "Take the Exam" / "Track My Order". A fresh single-use key is issued on each tap (FR-K1).
export function PortalButton({ type, id, itemId }: { type: ItemType; id: string; itemId: string }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  async function go() {
    setBusy(true)
    try {
      await goToPortal(type, id, itemId)
    } catch {
      toast(t.order.handoffError)
      setBusy(false)
    }
  }

  return (
    <button className="apply-btn portal-btn" type="button" onClick={go} disabled={busy}>
      {t.portalButton[type]}
    </button>
  )
}
