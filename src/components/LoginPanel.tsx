import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { api } from '../api'
import type { Student } from '../api'
import { HELP_URL, OTP_LENGTH, OTP_RESEND_SECONDS } from '../config'
import { track } from '../lib/analytics'
import { digits, errorMessage, isMobile, maskMobile } from '../lib/format'
import { t } from '../strings'
import { useToast } from './Toast'

// Mobile number, then one-time passcode boxes: the portal's "Login / Register" block (FR-L1, FR-L2).
export function LoginPanel({ title = t.login.title, onDone }: { title?: string; onDone: (s: Student) => void }) {
  const toast = useToast()
  const [stage, setStage] = useState<'mobile' | 'otp'>('mobile')
  const [mobile, setMobile] = useState('')
  const [mobileError, setMobileError] = useState('')
  const [otp, setOtp] = useState<string[]>(() => Array<string>(OTP_LENGTH).fill(''))
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [wait, setWait] = useState(0)
  const [resends, setResends] = useState(0)
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (wait <= 0) return
    const timer = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(timer)
  }, [wait])

  async function sendOtp(e?: FormEvent) {
    e?.preventDefault()
    if (!isMobile(mobile)) return toast(t.login.mobileToast)
    setBusy(true)
    if (stage === 'mobile') track('login_started')
    try {
      const res = await api.requestOtp(mobile)
      setKey(res.key)
      setOtp(Array<string>(OTP_LENGTH).fill(''))
      setStage('otp')
      setWait(OTP_RESEND_SECONDS)
      toast(t.login.otpSent)
      setTimeout(() => otpRefs.current[0]?.focus(), 0)
    } catch (err) {
      toast(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function login(e: FormEvent) {
    e.preventDefault()
    const passcode = otp.join('')
    if (passcode.length !== OTP_LENGTH) {
      toast(t.login.otpIncomplete(OTP_LENGTH))
      otpRefs.current[otp.findIndex((d) => !d)]?.focus()
      return
    }
    setBusy(true)
    try {
      const student = await api.verifyOtp(mobile, passcode, key)
      track('login_completed')
      onDone(student)
    } catch (err) {
      toast(errorMessage(err))
      setBusy(false)
      otpRefs.current[OTP_LENGTH - 1]?.focus()
    }
  }

  // Typing, pasting and SMS autofill can all deliver several digits at once: spread them over the boxes.
  function onOtpInput(index: number, raw: string) {
    const typed = digits(raw, OTP_LENGTH)
    setOtp((current) => {
      const next = [...current]
      if (typed.length <= 1) next[index] = typed
      else typed.split('').forEach((d, i) => index + i < OTP_LENGTH && (next[index + i] = d))
      return next
    })
    if (typed) otpRefs.current[Math.min(OTP_LENGTH - 1, index + typed.length)]?.focus()
  }

  function onOtpKeyDown(index: number, e: KeyboardEvent) {
    if (e.key === 'Backspace' && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus()
  }

  if (stage === 'mobile') {
    return (
      <form className="loginSection" onSubmit={sendOtp} noValidate>
        <h2>{title}</h2>
        <p>{t.login.body}</p>
        <div className="input-group">
          <div>
            🇮🇳 <b>+91</b>
          </div>
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder={t.login.mobilePlaceholder}
            aria-label={t.login.mobilePlaceholder}
            maxLength={10}
            autoFocus
            value={mobile}
            onChange={(e) => {
              const v = digits(e.target.value, 10)
              setMobile(v)
              setMobileError(v.length === 10 && !isMobile(v) ? t.login.mobileInvalid : '')
            }}
            onBlur={() => setMobileError(!mobile || isMobile(mobile) ? '' : t.login.mobileInvalid)}
          />
        </div>
        <button type="submit" className="continue-btn" disabled={busy}>
          {t.login.continue}
          {busy && (
            <span>
              <div className="loader" />
            </span>
          )}
        </button>
        <div className="mobileErrorHolder" role="alert">
          <p>{mobileError}</p>
        </div>
      </form>
    )
  }

  return (
    <form className="loginSection" onSubmit={login} noValidate>
      <h2>
        {t.login.otpTitle} <span>{t.login.otpAs(maskMobile(mobile))}</span>
      </h2>
      <p>{t.login.otpBody}</p>
      <div className="input-group otp">
        {otp.map((digit, i) => (
          <input
            key={i}
            ref={(el) => {
              otpRefs.current[i] = el
            }}
            className="otpEntry"
            type="tel"
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            autoFocus={i === 0}
            aria-label={t.login.otpDigit(i + 1)}
            value={digit}
            onChange={(e) => onOtpInput(i, e.target.value)}
            onKeyDown={(e) => onOtpKeyDown(i, e)}
          />
        ))}
      </div>
      <button type="submit" className="continue-btn" disabled={busy}>
        {t.login.loginNow}
        {busy && (
          <span>
            <div className="loader" />
          </span>
        )}
      </button>
      <div className="otp-links">
        {wait > 0 ? (
          <span>{t.login.resendIn(wait)}</span>
        ) : (
          <button
            type="button"
            className="text-btn"
            disabled={busy}
            onClick={() => {
              setResends((n) => n + 1)
              void sendOtp()
            }}
          >
            {t.login.resend}
          </button>
        )}
        <button type="button" className="text-btn" onClick={() => setStage('mobile')}>
          {t.login.changeNumber}
        </button>
        {resends >= 2 && (
          <a href={HELP_URL} target="_blank" rel="noopener noreferrer">
            {t.login.notReceived}
          </a>
        )}
      </div>
    </form>
  )
}
