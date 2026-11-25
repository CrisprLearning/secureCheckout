import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from './api'
import type { Student } from './api'
import { isAnotherCandidate } from './lib/handoff'

interface SessionValue {
  /** undefined while the session is still being checked. */
  student: Student | null | undefined
  setStudent: (s: Student | null) => void
}

const SessionContext = createContext<SessionValue>({ student: undefined, setStudent: () => {} })

export function SessionProvider({ children }: { children: ReactNode }) {
  const [student, setStudent] = useState<Student | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    api
      .getSession()
      .then((s) => {
        // Sent here by the portal on behalf of a different candidate: this one is logged out.
        if (s && isAnotherCandidate(s.mobile)) {
          api.logout()
          s = null
        }
        if (!cancelled) setStudent(s)
      })
      .catch(() => !cancelled && setStudent(null))
    return () => {
      cancelled = true
    }
  }, [])

  return <SessionContext value={{ student, setStudent }}>{children}</SessionContext>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useSession = () => useContext(SessionContext)
