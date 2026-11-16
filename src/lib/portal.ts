import { api } from '../api'
import type { ItemType, Order } from '../api/types'
import { PORTAL_URL } from '../config'
import { track } from './analytics'

/** Builds the Portal entry URL (contracts U2, U3, U4). `redirect` is always one of three fixed words. */
function portalUrl(type: ItemType, id: string, key: string): string {
  const redirect = { Course: 'COURSE', 'Test Series': 'EXAM', Book: 'ORDERS' }[type]
  return `${PORTAL_URL}/?${new URLSearchParams({ redirect, id, key })}`
}

/** Issues a fresh single-use key (FR-K1) and sends the browser to the Portal. Rejects if the key cannot be issued. */
export async function goToPortal(type: ItemType, id: string, itemId: string): Promise<void> {
  const { key } = await api.createHandoff()
  track('portal_handoff', { item_id: itemId, item_type: type })
  window.location.assign(portalUrl(type, id, key))
}

/** Where an order's automatic redirect lands: its first item (a book opens the order's tracking page). */
export function orderPortalTarget(order: Order): { type: ItemType; id: string; itemId: string } | null {
  const first = order.items[0]
  if (!first) return null
  return { type: first.type, id: first.type === 'Book' ? order.id : first.portalRef, itemId: first.itemId }
}
