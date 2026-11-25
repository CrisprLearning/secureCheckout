// Arriving from the candidate portal. Its links end in "#u=<mark>", a short fingerprint of the mobile number
// of the candidate logged in there. If this site still holds a different candidate's login, that login is
// dropped, so nobody is shown (or pays as) the wrong person. The two sites keep separate login cookies.
//
// The mark is FNV-1a over the registered mobile number, 8 hex digits; the portal computes the same value in
// its src/lib/checkout.js (candidateMark). Keep the two alike.

export function candidateMark(mobile: string): string {
  const digits = mobile.replace(/\D/g, '').slice(-10)
  if (digits.length !== 10) return ''
  let hash = 0x811c9dc5
  for (const ch of `crispr-candidate:${digits}`) {
    hash ^= ch.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function takeMark(): string {
  const match = window.location.hash.match(/(?:^#|&)u=([0-9a-f]{8})(?:&|$)/)
  if (!match) return ''
  // Out of the address bar, so a reload or a shared link does not carry it.
  window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
  return match[1]
}

// Read once, when the page loads: the router rewrites the address soon after.
const expectedMark = takeMark()

/** True when the portal named a candidate and `mobile`, the one logged in here, is someone else. */
export function isAnotherCandidate(mobile: string): boolean {
  if (!expectedMark) return false
  return candidateMark(mobile) !== expectedMark
}
