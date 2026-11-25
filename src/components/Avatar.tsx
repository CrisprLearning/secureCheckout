import { useEffect, useState } from 'react'
import { api } from '../api'

// The portal saves this placeholder as the photo of candidates who never added one.
const PLACEHOLDER_PHOTO = 'https://img.icons8.com/color/100/user.png'

/** The logged-in candidate's profile photo. Shows their initial until it loads, and when they have no photo. */
export function Avatar({ initial }: { initial: string }) {
  const [photo, setPhoto] = useState('')

  useEffect(() => {
    let cancelled = false
    api
      .getProfilePhoto()
      .then((src) => !cancelled && setPhoto(src === PLACEHOLDER_PHOTO ? '' : src))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <span className="cp-avatar-wrap" aria-hidden="true">
      {photo ? <img className="cp-avatar" src={photo} alt="" onError={() => setPhoto('')} /> : initial}
    </span>
  )
}
