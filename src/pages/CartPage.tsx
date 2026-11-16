import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { api, ApiError } from '../api'
import type { Billing, CartLine, Student, VerifiedCart } from '../api'
import { CartLines, SummaryLines } from '../components/CartLines'
import { DemoPaymentSheet } from '../components/DemoPaymentSheet'
import { EmptyState } from '../components/EmptyState'
import { LoginPanel } from '../components/LoginPanel'
import { PortalButton } from '../components/PortalButton'
import { LoaderScreen, TrashIcon } from '../components/Shell'
import { CartSkeleton, SummaryShimmer } from '../components/Skeleton'
import { useToast } from '../components/Toast'
import { IS_DEMO, PRIVACY_POLICY_URL, REFUND_POLICY_URL, SUPPORT_EMAIL, SUPPORT_PHONE, TERMS_URL } from '../config'
import { captureUtm, track } from '../lib/analytics'
import {
  addToCart,
  clearCheckoutData,
  forgetCouponCode,
  getCouponCode,
  rememberCouponCode,
  removeFromCart,
  retrieveCart,
  setCount,
  syncCart,
} from '../lib/cart'
import { addressChars, digits, errorMessage, formatINR, isEmail, isPin, nameChars } from '../lib/format'
import { districtsOf, loadPincodes, lookupPincode } from '../lib/pincodes'
import type { PincodeData } from '../lib/pincodes'
import { openRazorpay } from '../lib/razorpay'
import type { PaymentResult } from '../lib/razorpay'
import { useSession } from '../session'
import { t } from '../strings'

const ITEM_ID = /^[A-Za-z0-9_-]{1,32}$/
const BILLING_FIELDS = ['fullname', 'address', 'locality', 'city', 'state', 'pincode', 'email'] as const
const NO_BILLING: Billing = { fullname: '', address: '', locality: '', city: '', state: '', pincode: '', email: '' }

function billingFor(student: Student): Billing {
  return { ...NO_BILLING, fullname: student.name ?? '', ...student.billing }
}

// Secure checkout, laid out like the candidate portal's: login and billing on one side, order summary on the other.
export function CartPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const retryRequested = (location.state as { retryPayment?: boolean } | null)?.retryPayment === true
  const retried = useRef(false)
  const { student, setStudent } = useSession()
  const [ready, setReady] = useState(false)
  const [invalidItem, setInvalidItem] = useState(false)
  const [cart, setCart] = useState<CartLine[]>([])
  const [verified, setVerified] = useState<VerifiedCart | null>(null)
  const [billing, setBilling] = useState<Billing>(NO_BILLING)
  const [code, setCode] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [pinTouched, setPinTouched] = useState(false)
  const [priceFailed, setPriceFailed] = useState(false)
  const [places, setPlaces] = useState<PincodeData | null>(null)
  const [phase, setPhase] = useState<'idle' | 'opening' | 'verifying'>('idle')
  const [demoPay, setDemoPay] = useState<{ amount: number; resolve: (r: PaymentResult) => void } | null>(null)
  const added = useRef<Promise<boolean> | null>(null)
  const paying = useRef(false)
  const studentId = student?.id

  // Entry point for U1: /cart?addItem={itemId}&type={itemType}. The item joins whatever is already in the cart.
  useEffect(() => {
    let cancelled = false
    // Held in a ref so the item is added once even when the effect runs twice (FR-C1).
    added.current ??= (async () => {
      const search = window.location.search
      const addItem = new URLSearchParams(search).get('addItem')
      captureUtm(search)
      if (addItem === null) return false
      let failed = false
      try {
        if (!ITEM_ID.test(addItem)) throw new ApiError('item_unavailable')
        // `type` in the URL is only a hint: the catalogue decides the type and price (UR-1).
        const item = await api.lookupItem(addItem)
        addToCart(item)
        track('view_cart', { item_id: item.code, item_type: item.type })
      } catch (err) {
        failed = true
        toast(errorMessage(err))
      }
      // Drop addItem from the address bar so a reload or a shared link does not add it again.
      navigate('/cart', { replace: true })
      return failed
    })()
    void added.current.then((failed) => {
      if (cancelled) return
      setInvalidItem(failed)
      setCart(retrieveCart())
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [navigate, toast])

  // Once the student is known, the server prices the cart: ownership, discount, taxes, delivery and total.
  const revalidate = useCallback(
    async (opts: { applying?: boolean } = {}) => {
      const lines = retrieveCart()
      setCart(lines)
      if (!studentId || lines.length === 0) return setVerified(null)
      setPriceFailed(false)
      try {
        const wanted = getCouponCode()
        const res = await api.validateCart(
          lines.map(({ itemId, number }) => ({ itemId, number })),
          wanted,
        )
        syncCart(res.cart)
        setCart(retrieveCart())
        setVerified(res)
        if (wanted && res.summary.discount.amount === 0) {
          forgetCouponCode()
          if (opts.applying) toast(t.cart.codeInvalid)
        }
      } catch (err) {
        if (err instanceof ApiError && err.code === 'unauthenticated') setStudent(null)
        setPriceFailed(true)
        toast(errorMessage(err))
      }
    },
    [studentId, setStudent, toast],
  )

  useEffect(() => {
    if (ready) void revalidate()
  }, [ready, revalidate])

  useEffect(() => {
    if (student) setBilling(billingFor(student))
    // Only when a different student logs in: later edits to the form must not be overwritten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId])

  // Load the pincode table once someone is logged in and the billing form is about to show.
  useEffect(() => {
    if (!studentId) return
    let cancelled = false
    loadPincodes()
      .then((data) => !cancelled && setPlaces(data))
      .catch(() => {}) // Without the table the form still works; State and City just cannot be chosen yet.
    return () => {
      cancelled = true
    }
  }, [studentId])

  // A saved address may hold a pincode but a State or City the table does not list: fill them from the pincode.
  useEffect(() => {
    if (!places) return
    setBilling((b) => {
      const match = isPin(b.pincode) ? lookupPincode(places, b.pincode) : null
      if (!match) return b
      const stateOk = places.states.includes(b.state)
      const cityOk = stateOk && districtsOf(places, b.state).includes(b.city)
      return stateOk && cityOk ? b : { ...b, ...match }
    })
  }, [places, studentId])

  async function logout() {
    await api.logout().catch(() => {})
    setStudent(null)
    setVerified(null)
    forgetCouponCode()
    setCode('')
  }

  function remove(itemId: string) {
    removeFromCart(itemId)
    void revalidate()
  }

  function changeCount(itemId: string, number: number) {
    setCount(itemId, number)
    void revalidate()
  }

  function applyCode() {
    const trimmed = code.trim()
    if (!trimmed) return
    rememberCouponCode(trimmed)
    void revalidate({ applying: true })
  }

  function removeCode() {
    forgetCouponCode()
    setCode('')
    void revalidate()
  }

  const summary = verified?.summary
  const lines = verified?.cart ?? cart
  const busy = phase !== 'idle'
  // Logged in, but the server has not priced the cart yet: the totals shimmer instead of showing stale numbers.
  const pricing = !!student && !verified && !priceFailed
  const hasBooks = lines.some((l) => l.type === 'Book')
  const allOwned = !!verified && verified.cart.length > 0 && verified.cart.every((l) => l.owned)
  const billingDone = BILLING_FIELDS.every((f) => billing[f].trim() !== '')
  const canPay = !!student && !!summary && summary.totalPayable > 0 && billingDone && !busy
  const localSubtotal = cart.reduce((sum, l) => sum + l.unitPrice * l.number, 0)
  // Checked against the pattern once the student leaves the field, and again on Pay.
  // State and City come from the bundled pincode table; a saved value the table does not know shows as unselected.
  const cities = places ? districtsOf(places, billing.state) : []
  const stateKnown = !!places && places.states.includes(billing.state)
  const cityKnown = cities.includes(billing.city)
  const pinMatch = places && isPin(billing.pincode) ? lookupPincode(places, billing.pincode) : null
  const pinUnknown = !!places && isPin(billing.pincode) && !pinMatch

  function changePincode(pincode: string) {
    const match = places && isPin(pincode) ? lookupPincode(places, pincode) : null
    // A recognised pincode sets State and City; anything else leaves the student's choices alone.
    setBilling((b) => ({ ...b, pincode, ...(match ?? {}) }))
  }

  const pinError = pinTouched && billing.pincode !== '' && !isPin(billing.pincode)
  const emailError = emailTouched && billing.email !== '' && !isEmail(billing.email)
  const setField = (k: keyof Billing, value: string) => setBilling((b) => ({ ...b, [k]: value }))

  async function pay() {
    if (!student || !verified || paying.current) return // Pay tapped twice: the second tap is ignored
    if (pinMatch && pinMatch.state !== billing.state) return toast(t.billing.stateMismatch(pinMatch.state))
    if (!isPin(billing.pincode)) {
      setPinTouched(true)
      return toast(t.billing.pincodeInvalid)
    }
    if (!isEmail(billing.email.trim())) {
      setEmailTouched(true)
      return toast(t.billing.emailInvalid)
    }
    paying.current = true
    setPhase('opening')
    const payable = verified.cart.filter((l) => !l.owned)
    try {
      track('begin_checkout', { value: verified.summary.totalPayable / 100, currency: 'INR' })
      const { order, razorpay } = await api.createOrder({
        cart: payable.map(({ itemId, number }) => ({ itemId, number })),
        discountCode: getCouponCode(),
        billing: Object.fromEntries(BILLING_FIELDS.map((f) => [f, billing[f].trim()])) as unknown as Billing,
        expectedTotal: verified.summary.totalPayable,
        utm: captureUtm(''),
      })

      const result = IS_DEMO
        ? await new Promise<PaymentResult>((resolve) => setDemoPay({ amount: razorpay.amount, resolve }))
        : await openRazorpay(razorpay, {
            description: payable.map((l) => l.title).join(', ').slice(0, 250),
            name: billing.fullname,
            mobile: student.mobile,
            email: billing.email.trim(),
          })
      setDemoPay(null)

      if (result.status !== 'success') {
        // A failed or cancelled payment gets its own screen, with a Retry Payment button that comes back here.
        if (result.status === 'failed') track('payment_failed')
        const reason = result.status === 'failed' ? result.reason : t.pay.cancelledReason
        navigate(`/order/${order.id}`, { state: { paymentFailed: true, reason } })
        return
      }

      // Never show success from the browser result alone: the server verifies it (FR-P3).
      setPhase('verifying')
      clearCheckoutData()
      try {
        await api.verifyPayment({ orderId: order.id, ...result })
      } catch {
        // The webhook can still complete the order; the order page keeps checking.
      }
      navigate(`/order/${order.id}`, { state: { justPaid: true } })
    } catch (err) {
      setDemoPay(null)
      if (err instanceof ApiError && err.code === 'price_changed') {
        await revalidate()
        toast(t.cart.priceChanged)
      } else if (err instanceof ApiError && err.code === 'unauthenticated') {
        setStudent(null)
        toast(errorMessage(err))
      } else if (err instanceof ApiError) {
        if (err.code === 'already_owned' || err.code === 'item_unavailable') await revalidate()
        toast(errorMessage(err))
      } else {
        toast(t.pay.notInitiated)
      }
    } finally {
      paying.current = false
      setPhase('idle')
    }
  }

  // Arriving from "Retry Payment": start the payment again as soon as the cart has been priced.
  useEffect(() => {
    if (!retryRequested || !canPay || retried.current) return
    retried.current = true
    navigate('/cart', { replace: true, state: null })
    void pay()
  })

  if (!ready || student === undefined) {
    return <CartSkeleton />
  }

  if (cart.length === 0) {
    // An unknown or withdrawn item (UR-4) reads differently from a cart that is simply empty.
    return invalidItem ? (
      <EmptyState title={t.cart.invalidTitle} body={t.cart.invalidBody} />
    ) : (
      <EmptyState title={t.cart.emptyTitle} body={t.cart.emptyBody} />
    )
  }

  return (
    <div className="container">
      <div className="form-column">
      <section className="form-section">
        {student ? (
          <div className="loginSection">
            <div className="cp-checkout-user">
              <span className="cp-avatar-wrap" aria-hidden="true">
                {(billing.fullname.trim()[0] ?? '').toUpperCase()}
              </span>
              <h2>
                <span className="logged-in-title">
                  {t.login.loggedIn} {student.name && <span>{t.login.loggedInAs(student.name)}</span>}
                </span>
                <button type="button" className="logoutButton" onClick={logout} disabled={busy}>
                  {t.login.logout}
                </button>
              </h2>
            </div>
            <div className="input-group">
              <div>
                🇮🇳 <b>+91</b>
              </div>
              <input type="tel" value={student.mobile} aria-label={t.login.mobilePlaceholder} disabled readOnly />
            </div>
          </div>
        ) : (
          <LoginPanel onDone={setStudent} />
        )}

        {student && (
          <div className="addressSection">
            <h2>{t.billing.title}</h2>
            <p>{hasBooks ? t.billing.bodyDelivery : t.billing.body}</p>
            <div className="billing-group">
              <input
                type="text"
                autoComplete="name"
                placeholder={t.billing.fullname}
                aria-label={t.billing.fullname}
                maxLength={80}
                value={billing.fullname}
                onChange={(e) => setField('fullname', nameChars(e.target.value))}
              />
            </div>
            <div className="billing-group">
              <input
                type="text"
                autoComplete="address-line1"
                placeholder={t.billing.address}
                aria-label={t.billing.address}
                maxLength={120}
                value={billing.address}
                onChange={(e) => setField('address', addressChars(e.target.value))}
              />
              <input
                type="text"
                autoComplete="address-line2"
                placeholder={t.billing.locality}
                aria-label={t.billing.locality}
                maxLength={120}
                value={billing.locality}
                onChange={(e) => setField('locality', addressChars(e.target.value))}
              />
            </div>
            {/* The pincode fills State and City from the table bundled with the app. */}
            <div className="billing-group">
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="postal-code"
                placeholder={t.billing.pincode}
                aria-label={t.billing.pincode}
                value={billing.pincode}
                aria-invalid={pinError}
                aria-describedby={pinError ? 'pin-error' : pinUnknown ? 'pin-hint' : undefined}
                onChange={(e) => changePincode(digits(e.target.value, 6))}
                onBlur={() => setPinTouched(true)}
              />
              <select
                autoComplete="address-level1"
                aria-label={t.billing.state}
                className={billing.state ? '' : 'is-empty'}
                value={stateKnown ? billing.state : ''}
                disabled={!places}
                onChange={(e) => setBilling((b) => ({ ...b, state: e.target.value, city: '' }))}
              >
                <option value="">{t.billing.state}</option>
                {places?.states.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <select
                autoComplete="address-level2"
                aria-label={t.billing.city}
                className={billing.city ? '' : 'is-empty'}
                value={cityKnown ? billing.city : ''}
                disabled={!stateKnown}
                onChange={(e) => setField('city', e.target.value)}
              >
                <option value="">{t.billing.city}</option>
                {cities.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            {pinError ? (
              <p id="pin-error" className="field-error" role="alert">
                {t.billing.pincodeInvalid}
              </p>
            ) : (
              pinUnknown && (
                <p id="pin-hint" className="field-hint">
                  {t.billing.pincodeUnknown}
                </p>
              )
            )}
            <input
              type="text"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder={t.billing.email}
              aria-label={t.billing.email}
              aria-invalid={emailError}
              aria-describedby={emailError ? 'email-error' : undefined}
              maxLength={120}
              value={billing.email}
              onChange={(e) => setField('email', e.target.value.replace(/\s/g, ''))}
              onBlur={() => setEmailTouched(true)}
            />
            {emailError && (
              <p id="email-error" className="field-error" role="alert">
                {t.billing.emailInvalid}
              </p>
            )}
          </div>
        )}

        <section className="payment-section">
          <p>
            {t.terms.before}
            <a href={TERMS_URL} target="_blank" rel="noopener noreferrer">
              {t.terms.terms}
            </a>
            {t.terms.and}
            <a href={REFUND_POLICY_URL} target="_blank" rel="noopener noreferrer">
              {t.terms.refund}
            </a>
            {t.terms.understand}
            <a href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer">
              {t.terms.privacy}
            </a>
            .
          </p>
        </section>
      </section>
      {/* Help line: under the form box on desktop, under every box on phones (see .help-line in index.css). */}
      <p className="help-line">
        {t.terms.contactBefore}
        <a href={`tel:+91${SUPPORT_PHONE}`}>{SUPPORT_PHONE}</a>
        {t.terms.contactOr}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        {t.terms.contactAfter}
      </p>
      </div>

      <section className="summary-section">
        <h2>{t.cart.summaryTitle}</h2>

        <CartLines
          lines={lines}
          action={(line) => (
            <button
              type="button"
              className="summary-item-remove"
              title={t.cart.remove}
              aria-label={`${t.cart.remove}: ${line.title}`}
              onClick={() => remove(line.itemId)}
              disabled={busy}
            >
              <TrashIcon />
            </button>
          )}
          extra={(line) => {
            if ('owned' in line && line.owned) {
              return <PortalButton type={line.type} id={line.portalRef} itemId={line.itemId} />
            }
            if (line.type !== 'Book') return null
            return (
              <span className="qty">
                <button type="button" aria-label={t.cart.fewer} disabled={busy || line.number <= 1} onClick={() => changeCount(line.itemId, line.number - 1)}>
                  −
                </button>
                <button type="button" aria-label={t.cart.more} disabled={busy} onClick={() => changeCount(line.itemId, line.number + 1)}>
                  +
                </button>
              </span>
            )
          }}
        />

        {summary && !allOwned && (
          <div className="apply-section">
            {summary.discount.amount > 0 ? (
              <>
                <input type="text" aria-label={t.cart.codePlaceholder} value={summary.discount.code} disabled readOnly />
                <button type="button" className="apply-btn" onClick={removeCode} disabled={busy}>
                  {t.cart.remove}
                </button>
              </>
            ) : (
              <>
                <input
                  type="text"
                  placeholder={t.cart.codePlaceholder}
                  aria-label={t.cart.codePlaceholder}
                  maxLength={40}
                  value={code}
                  autoComplete="off"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  // Codes are letters and digits only: typed or pasted text is upper-cased and everything else dropped.
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                />
                <button type="button" className="apply-btn" onClick={applyCode} disabled={busy || code === ''}>
                  {t.cart.apply}
                </button>
              </>
            )}
          </div>
        )}

        {pricing ? (
          <SummaryShimmer />
        ) : summary ? (
          <SummaryLines summary={summary} />
        ) : (
          <div className="cartSummary">
            <div className="summary-item">
              <span>{t.cart.subtotal}</span>
              <span>{formatINR(localSubtotal)}</span>
            </div>
            <div className="summary-item total">
              <span>{t.cart.total}</span>
              <span className="price">
                {formatINR(localSubtotal)}
                <span className="superscript">†</span>
              </span>
            </div>
            <div className="summary-item is-note">
              <span>
                {t.cart.preLoginNote}
                <span className="superscript">†</span>
              </span>
            </div>
          </div>
        )}

        {/* On phones and portrait tablets this bar is pinned to the bottom of the screen, with the total beside it. */}
        <div className="pay-bar">
          <div className="pay-bar-total" aria-hidden="true">
            <span>{t.cart.total}</span>
            <strong>{pricing ? <span className="sk sk-inline" /> : formatINR(summary ? summary.totalPayable : localSubtotal)}</strong>
          </div>
          <button type="button" className="pay-btn" disabled={!canPay} onClick={pay} aria-describedby={canPay ? undefined : 'pay-hint'}>
            {t.pay.button}
          </button>
          {!canPay && !busy && !pricing && (
            <p id="pay-hint" className="pay-hint">
              {!student ? t.pay.hintLogin : allOwned ? t.cart.allOwned : t.pay.hintBilling}
            </p>
          )}
        </div>
      </section>

      {demoPay && <DemoPaymentSheet amount={demoPay.amount} onResult={demoPay.resolve} />}

      {phase === 'verifying' && (
        <div className="modal-backdrop">
          <div className="modal is-status" role="status">
            <LoaderScreen />
            <p>{t.pay.verifying}</p>
          </div>
        </div>
      )}
    </div>
  )
}
