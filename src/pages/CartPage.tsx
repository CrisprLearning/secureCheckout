import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { api, ApiError } from '../api'
import type { Billing, CartLine, Student, VerifiedCart } from '../api'
import { Avatar } from '../components/Avatar'
import { CartLines, SummaryLines } from '../components/CartLines'
import { chosenPlan, dueNow, dueText, isInstalment, isSingle } from '../lib/plans'
import { EmptyState } from '../components/EmptyState'
import { OptionSelect } from '../components/OptionSelect'
import { LoginPanel } from '../components/LoginPanel'
import { LoaderScreen, TrashIcon } from '../components/Shell'
import { CartSkeleton, SummaryShimmer } from '../components/Skeleton'
import { useToast } from '../components/Toast'
import { PRIVACY_POLICY_URL, REFUND_POLICY_URL, SUPPORT_EMAIL, SUPPORT_PHONE, TERMS_URL } from '../config'
import { track } from '../lib/analytics'
import {
  addToCart,
  clearCheckoutData,
  forgetCouponCode,
  getCouponCode,
  MAX_QUANTITY,
  isDelivered,
  missingOption,
  optionLabel,
  setOption,
  setPlan,
  rememberCouponCode,
  removeFromCart,
  retrieveCart,
  rowId,
  saveCart,
  setQuantity,
  withChargeLabels,
} from '../lib/cart'
import { addressChars, digits, errorMessage, formatINR, isEmail, isPin, nameChars } from '../lib/format'
import { districtsOf, loadPincodes, lookupPincode } from '../lib/pincodes'
import type { PincodeData } from '../lib/pincodes'
import { openRazorpay } from '../lib/razorpay'
import { saveResult } from '../lib/result'
import type { PaymentRecord } from '../lib/result'
import { useSession } from '../session'
import { t } from '../strings'

const ITEM_ID = /^[A-Za-z0-9_-]{1,32}$/
const BILLING_FIELDS = ['fullname', 'address', 'locality', 'city', 'state', 'pincode', 'email'] as const
const NO_BILLING: Billing = { fullname: '', address: '', locality: '', city: '', state: '', pincode: '', email: '' }

function billingFor(student: Student): Billing {
  return { ...NO_BILLING, fullname: student.name, ...student.billing }
}

const FIRST_STATE = 'Kerala'

/** The fields the server expects for a cart line, and nothing else. */
const forServer = (lines: CartLine[]): CartLine[] =>
  lines.map(({ itemId, title, type, unitPrice, number, options, plans, plan }) => ({
    itemId,
    title,
    type,
    unitPrice,
    number,
    // The buyer's picks (size: M) travel with the line; the server stores the cart as it is sent.
    ...(options && Object.keys(options).length > 0 ? { options } : {}),
    // The plan's type only: the server reads the amounts from its own catalogue.
    ...(plans && plans.length > 0 ? { plan: (plans.find((p) => p.type === plan) ?? plans.find((p) => p.type === 'FULL') ?? plans[0]).type } : {}),
  }))

/**
 * Re-reads every line from the catalogue. The server refuses a cart whose stored prices are out of date,
 * so this is how a cart that has sat in the browser through a price change gets back in step.
 */
async function refreshFromCatalogue(lines: CartLine[]): Promise<{ lines: CartLine[]; removed: boolean }> {
  const fresh = await Promise.all(
    lines.map(async (line) => {
      try {
        const item = await api.lookupItem(line.itemId)
        return {
          ...line,
          title: item.title,
          type: item.type,
          unitPrice: item.sellingPrice,
          displayImage: item.photo,
          isBook: item.isBook,
          isMerch: item.isMerch,
          chargeLabels: item.chargeLabels,
          choices: item.options,
          plans: item.plans,
          commencement: item.commencement,
        }
      } catch (err) {
        if (err instanceof ApiError && err.code === 'item_unavailable') return null
        throw err
      }
    }),
  )
  const kept = fresh.filter((l): l is NonNullable<typeof l> => l !== null)
  return { lines: kept, removed: kept.length < lines.length }
}

// Secure checkout against the live candidate APIs, laid out like the candidate portal's: login and billing on one side, order summary on the other.
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
  const [removing, setRemoving] = useState<CartLine | null>(null)
  // Courses and test series in the cart that this candidate has already bought.
  const [owned, setOwned] = useState<CartLine[]>([])
  // The payment plan popup: which item it is for, and which plan's tab is showing.
  const [planView, setPlanView] = useState<{ lineId: string; tab: string } | null>(null)
  const [billing, setBilling] = useState<Billing>(NO_BILLING)
  const [code, setCode] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [pinTouched, setPinTouched] = useState(false)
  const [priceFailed, setPriceFailed] = useState(false)
  const [places, setPlaces] = useState<PincodeData | null>(null)
  const [phase, setPhase] = useState<'idle' | 'opening' | 'verifying'>('idle')
  const added = useRef<Promise<boolean> | null>(null)
  const paying = useRef(false)
  // The mobile number identifies the candidate for the length of this page.
  const studentId = student?.mobile

  // Entry point: /cart?addItem={itemId}, with &selection={value} for an item that has options. The item joins whatever is already in the cart.
  useEffect(() => {
    let cancelled = false
    // Held in a ref so the item is added once even when the effect runs twice.
    added.current ??= (async () => {
      const search = window.location.search
      const params = new URLSearchParams(search)
      const addItem = params.get('addItem')
      if (addItem === null) return false
      let failed = false
      try {
        if (!ITEM_ID.test(addItem)) throw new ApiError('item_unavailable')
        // The catalogue decides the title, type, price and options.
        const item = await api.lookupItem(addItem)
        // &selection=M picks the item's option (its size); a value the item does not offer is ignored.
        addToCart(item, params.get('selection'))
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

  // Once the candidate is logged in, the server prices the cart: discount, taxes, extras and the total.
  const revalidate = useCallback(
    async (opts: { applying?: boolean } = {}) => {
      let lines = retrieveCart()
      setCart(lines)
      if (!studentId || lines.length === 0) return setVerified(null)
      setPriceFailed(false)
      try {
        const wanted = getCouponCode()
        let res: VerifiedCart
        try {
          res = await api.validateCart(forServer(lines), wanted)
        } catch (err) {
          // The server rejects the whole cart when a stored price is stale or an item was withdrawn.
          // Refresh from the catalogue and try once more before giving up.
          if (!(err instanceof ApiError) || err.code !== 'server') throw err
          const fresh = await refreshFromCatalogue(lines)
          const changed = fresh.removed || fresh.lines.some((l, i) => l.unitPrice !== lines[i]?.unitPrice)
          if (!changed) throw err
          lines = fresh.lines
          saveCart(lines)
          setCart(lines)
          toast(fresh.removed ? t.cart.itemsRemoved : t.cart.pricesUpdated)
          if (lines.length === 0) return setVerified(null)
          res = await api.validateCart(forServer(lines), wanted)
        }
        // The server's totals with our own lines, which also carry the pictures.
        const ownedIds = new Set((res.alreadyPurchased ?? []).map((item) => item.itemId))
        setVerified({ cart: lines, summary: withChargeLabels(res.summary, lines), alreadyPurchased: res.alreadyPurchased })
        // Opens the popup that takes already-bought courses and test series out of the cart.
        setOwned(lines.filter((l) => ownedIds.has(l.itemId)))
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

  function logout() {
    api.logout()
    setStudent(null)
    setVerified(null)
    setOwned([])
    forgetCouponCode()
    setCode('')
  }

  function removeOwned() {
    for (const line of owned) removeFromCart(rowId(line))
    setOwned([])
    void revalidate()
  }

  function confirmRemove() {
    if (!removing) return
    removeFromCart(rowId(removing))
    setRemoving(null)
    void revalidate()
  }

  function changeQuantity(lineId: string, number: number) {
    setQuantity(lineId, number)
    void revalidate()
  }

  // A pick does not change the price, so the cart is not re-priced.
  function chooseOption(lineId: string, name: string, value: string) {
    const next = setOption(lineId, name, value)
    setCart(next)
    setVerified((v) => v && { ...v, cart: next })
  }

  // An instalment plan changes what is charged now, and rules out gift codes.
  function choosePlan(lineId: string, type: string) {
    const next = setPlan(lineId, type)
    if (next.some(isInstalment)) {
      forgetCouponCode()
      setCode('')
    }
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
  const billingDone = BILLING_FIELDS.every((f) => billing[f].trim() !== '')
  const unchosen = missingOption(lines)
  const canPay = !!student && !!summary && summary.totalPayable > 0 && billingDone && !unchosen && owned.length === 0 && !busy
  const localDueNow = cart.reduce((sum, l) => sum + dueNow(l) * l.number, 0)
  const onInstalments = lines.some(isInstalment)
  const planLine = planView ? lines.find((l) => rowId(l) === planView.lineId && (l.plans ?? []).length > 0) : undefined
  const planTab = planLine?.plans!.find((p) => p.type === planView!.tab) ?? (planLine ? chosenPlan(planLine) : undefined)
  // Checked against the pattern once the student leaves the field, and again on Pay.
  // State and City come from the bundled pincode table; a saved value the table does not know shows as unselected.
  const cities = places ? districtsOf(places, billing.state) : []
  const stateKnown = !!places && places.states.includes(billing.state)
  // Most students are from Kerala, so it leads the list; the rest stay in alphabetical order.
  const stateChoices = places ? [...places.states.filter((st) => st === FIRST_STATE), ...places.states.filter((st) => st !== FIRST_STATE)] : []
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
    if (unchosen) return toast(t.pay.hintOption(optionLabel(unchosen.name).toLowerCase(), unchosen.line.title))
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
    const items = verified.cart
    const discountCode = getCouponCode()
    const attempt = (order: { transactionId: string }, rest: Partial<PaymentRecord> & Pick<PaymentRecord, 'status'>): PaymentRecord => ({
      items,
      summary: verified.summary,
      discountCode,
      orderNumber: order.transactionId,
      at: new Date().toISOString(),
      ...rest,
    })
    try {
      track('begin_checkout', { value: verified.summary.totalPayable / 100, currency: 'INR' })
      const order = await api.createOrder({
        cart: forServer(items),
        discountCode,
        billing: Object.fromEntries(BILLING_FIELDS.map((f) => [f, billing[f].trim()])) as unknown as Billing,
        mobile: student.mobile,
      })

      const result = await openRazorpay(order, {
        description: items.map((l) => l.title).join(', ').slice(0, 250),
        name: billing.fullname,
        mobile: student.mobile,
        email: billing.email.trim(),
      })

      if (result.status !== 'success') {
        // A failed or cancelled payment gets its own screen, with a Retry Payment button that comes back here.
        if (result.status === 'failed') track('payment_failed')
        saveResult(attempt(order, { status: 'failed', reason: result.status === 'failed' ? result.reason : t.pay.cancelledReason }))
        navigate('/payment')
        return
      }

      // Never show success from the browser result alone: the server checks Razorpay's signature first.
      setPhase('verifying')
      try {
        const portalPage = await api.acknowledgePayment(order, result)
        clearCheckoutData()
        // The server says where to go next; the success screen offers it as "Go to Candidate Portal".
        saveResult(attempt(order, { status: 'success', paymentId: result.razorpayPaymentId, portalUrl: portalPage }))
      } catch (err) {
        // Money has moved but the server did not confirm it. Never offer to pay again from here.
        clearCheckoutData()
        saveResult(
          attempt(order, {
            status: 'unconfirmed',
            paymentId: result.razorpayPaymentId,
            reason: err instanceof ApiError && err.fromServer ? err.message : undefined,
          }),
        )
      }
      navigate('/payment')
    } catch (err) {
      if (err instanceof ApiError && err.code === 'unauthenticated') {
        setStudent(null)
        toast(errorMessage(err))
      } else if (err instanceof ApiError) {
        // For example a price that changed since the cart was priced: show the server's reason and re-price.
        toast(errorMessage(err))
        await revalidate()
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
    // An unknown or withdrawn item reads differently from a cart that is simply empty.
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
              <Avatar key={student.mobile} initial={(billing.fullname.trim()[0] ?? '').toUpperCase()} />
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
            <p>{t.billing.body}</p>
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
              <OptionSelect
                variant="field"
                label={t.billing.state}
                placeholder={t.billing.state}
                ariaLabel={t.billing.state}
                values={stateChoices}
                value={stateKnown ? billing.state : ''}
                disabled={!places}
                onChange={(state) => setBilling((b) => ({ ...b, state, city: '' }))}
              />
              <OptionSelect
                variant="field"
                label={t.billing.city}
                placeholder={t.billing.city}
                ariaLabel={t.billing.city}
                values={cities}
                value={cityKnown ? billing.city : ''}
                disabled={!stateKnown}
                onChange={(city) => setField('city', city)}
              />
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
              className="cart-bin"
              title={t.cart.remove}
              aria-label={`${t.cart.remove}: ${line.title}`}
              onClick={() => setRemoving(line)}
              disabled={busy}
            >
              <TrashIcon />
            </button>
          )}
          quantity={(line) =>
            isDelivered(line) ? (
              <span className="qty" role="group" aria-label={`${t.cart.quantity}: ${line.title}`}>
                <button
                  type="button"
                  aria-label={t.cart.decrease}
                  onClick={() => changeQuantity(rowId(line), line.number - 1)}
                  disabled={busy || line.number <= 1}
                >
                  −
                </button>
                <span aria-live="polite">{line.number}</span>
                <button
                  type="button"
                  aria-label={t.cart.increase}
                  onClick={() => changeQuantity(rowId(line), line.number + 1)}
                  disabled={busy || line.number >= MAX_QUANTITY}
                >
                  +
                </button>
              </span>
            ) : isSingle(line) ? null : (
              <span className="product-size">x {line.number}</span>
            )
          }
          // The payment plan sits under the row's amount, at the right; a click opens its details.
          underPrice={(line) =>
            (line.plans ?? []).length > 0 ? (
              <button
                type="button"
                className="plan-chip"
                aria-haspopup="dialog"
                aria-label={`${t.plan.title}: ${chosenPlan(line)!.label}. ${t.plan.viewDetails}`}
                onClick={() => setPlanView({ lineId: rowId(line), tab: chosenPlan(line)!.type })}
                disabled={busy}
              >
                {t.plan.chipLabel} <b>{chosenPlan(line)!.label}</b>
                <svg width="9" height="6" viewBox="0 0 12 8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M1 1.5l5 5 5-5" />
                </svg>
              </button>
            ) : null
          }
          options={(line) =>
            (line.choices ?? []).map((choice) => {
              const picked = line.options?.[choice.name] ?? ''
              return (
                <OptionSelect
                  key={choice.name}
                  label={optionLabel(choice.name)}
                  values={choice.values}
                  value={picked}
                  placeholder={t.cart.selectOption(optionLabel(choice.name))}
                  ariaLabel={`${optionLabel(choice.name)}: ${line.title}`}
                  disabled={busy}
                  onChange={(value) => chooseOption(rowId(line), choice.name, value)}
                />
              )
            })
          }
        />

        {summary && (
          <div className="coupon-box">
            <span className="coupon-icon" aria-hidden="true">
              %
            </span>
            <div className="coupon-text">
              <strong>{t.cart.couponTitle}</strong>
              <span>{t.cart.couponBody}</span>
            </div>
          <div className="apply-section">
            {onInstalments ? (
              // Gift codes do not apply to instalments: the field is off, and Apply only explains why.
              // The button is aria-disabled rather than disabled so that a click still reaches it.
              <>
                <input type="text" placeholder={t.cart.codePlaceholder} aria-label={t.cart.codePlaceholder} value="" disabled readOnly />
                <button type="button" className="apply-btn is-disabled" aria-disabled="true" onClick={() => toast(t.plan.noGiftCode)}>
                  {t.cart.apply}
                </button>
              </>
            ) : summary.discount.amount > 0 ? (
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
              <span>{formatINR(localDueNow)}</span>
            </div>
            <div className="summary-item total">
              <span>{t.cart.total}</span>
              <span className="price">
                {formatINR(localDueNow)}
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

        {cart.some(isDelivered) && (
          <p className="delivery-note" role="note">
            {cart.some((l) => l.isMerch) ? t.cart.itemDelivery : t.cart.bookDelivery}
          </p>
        )}

        {/* On phones and portrait tablets this bar is pinned to the bottom of the screen, with the total beside it. */}
        <div className="pay-bar">
          <div className="pay-bar-total" aria-hidden="true">
            <span>{t.cart.total}</span>
            <strong>{pricing ? <span className="sk sk-inline" /> : formatINR(summary ? summary.totalPayable : localDueNow)}</strong>
          </div>
          <button type="button" className="pay-btn" disabled={!canPay} onClick={pay} aria-describedby={canPay ? undefined : 'pay-hint'}>
            {t.pay.button}
          </button>
          {!canPay && !busy && !pricing && (
            <p id="pay-hint" className="pay-hint">
              {!student ? t.pay.hintLogin : unchosen ? t.pay.hintOption(optionLabel(unchosen.name).toLowerCase(), unchosen.line.title) : t.pay.hintBilling}
            </p>
          )}
        </div>
      </section>

      {planLine && planTab && (
        <div className="modal-backdrop" onClick={() => setPlanView(null)}>
          <div
            className="modal plan-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="plan-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === 'Escape' && setPlanView(null)}
          >
            <h2 id="plan-title" className="plan-modal-title">
              {t.plan.titleFor} <b>{planLine.title}</b>
            </h2>
            <div className="plan-tabs" role="tablist">
              {planLine.plans!.map((plan, i) => (
                <button
                  type="button"
                  role="tab"
                  key={plan.type}
                  id={`plan-tab-${plan.type}`}
                  aria-selected={plan.type === planTab.type}
                  aria-controls="plan-panel"
                  className={plan.type === planTab.type ? 'is-active' : ''}
                  onClick={() => setPlanView({ lineId: rowId(planLine), tab: plan.type })}
                  autoFocus={i === 0}
                >
                  {plan.label}
                  {chosenPlan(planLine)?.type === plan.type && <span className="plan-tab-mark">{t.plan.selected}</span>}
                </button>
              ))}
            </div>
            <div id="plan-panel" role="tabpanel" aria-labelledby={`plan-tab-${planTab.type}`}>
              <table className="plan-table">
                <thead>
                  <tr>
                    <th scope="col">{t.plan.colPayment}</th>
                    <th scope="col">{t.plan.colWhen}</th>
                    <th scope="col">{t.plan.colAmount}</th>
                  </tr>
                </thead>
                <tbody>
                  {planTab.installments.map((inst, i) => (
                    <tr key={i}>
                      <td>{inst.label}</td>
                      <td>{dueText(inst, planLine.commencement)}</td>
                      <td>{formatINR(inst.amount * planLine.number)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={2}>
                      {t.cart.total}
                    </th>
                    <td>
                      {formatINR(planTab.installments.reduce((sum, i) => sum + i.amount, 0) * planLine.number)}
                      <span aria-hidden="true">*</span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="modal-actions">
              <button type="button" className="apply-btn" onClick={() => setPlanView(null)}>
                {t.plan.close}
              </button>
              {/* Picks the plan on show and closes: the label says what that plan charges at checkout. */}
              <button
                type="button"
                className="apply-btn is-primary plan-pay"
                onClick={() => {
                  if (chosenPlan(planLine)?.type !== planTab.type) choosePlan(rowId(planLine), planTab.type)
                  setPlanView(null)
                }}
              >
                {planTab.type === 'FULL' ? t.plan.payFull : t.plan.payFirst}
                <span>{formatINR(dueNow({ ...planLine, plan: planTab.type }) * planLine.number)}</span>
              </button>
            </div>
            <p className="plan-tax-note">{t.plan.taxNote}</p>
          </div>
        </div>
      )}

      {owned.length > 0 && (
        <div className="modal-backdrop">
          <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="owned-title" aria-describedby="owned-body">
            <h2 id="owned-title">{t.cart.ownedTitle}</h2>
            <p id="owned-body">{owned.length === 1 ? t.cart.ownedOne(owned[0].title) : t.cart.ownedMany}</p>
            {owned.length > 1 && (
              <ul className="owned-list">
                {owned.map((line) => (
                  <li key={rowId(line)}>{line.title}</li>
                ))}
              </ul>
            )}
            <div className="modal-actions">
              <button type="button" className="apply-btn is-primary" onClick={removeOwned} autoFocus>
                {owned.length === 1 ? t.cart.ownedRemoveOne : t.cart.ownedRemoveMany}
              </button>
            </div>
          </div>
        </div>
      )}

      {removing && (
        <div className="modal-backdrop" onClick={() => setRemoving(null)}>
          <div
            className="modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="remove-title"
            aria-describedby="remove-body"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === 'Escape' && setRemoving(null)}
          >
            <h2 id="remove-title">{t.cart.removeTitle}</h2>
            <p id="remove-body">{t.cart.removeBody(removing.title)}</p>
            <div className="modal-actions">
              <button type="button" className="apply-btn" onClick={() => setRemoving(null)} autoFocus>
                {t.cart.removeCancel}
              </button>
              <button type="button" className="apply-btn is-danger" onClick={confirmRemove}>
                {t.cart.remove}
              </button>
            </div>
          </div>
        </div>
      )}

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
