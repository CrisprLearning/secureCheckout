// All interface text lives here so another language (Malayalam) can be added later.
// Wording follows the candidate portal's checkout page. Messages from the server are shown as it sends them.

export const t = {
  brand: 'Crispr Learning',
  logoAlt: 'Crispr Learning logo',
  secure: 'Secure checkout',
  loading: 'Loading',

  /** Label of the portal link for an item type; anything else falls back to `portalDefault`. */
  portalButton: { Course: 'Access the Course', 'Test Series': 'Take the Exam' } as Record<string, string>,
  portalDefault: 'Go to the Students Portal',

  cart: {
    summaryTitle: 'Order Summary',
    emptyTitle: 'Your cart is empty',
    emptyBody: 'Pick a course or test series on our site and it will show up here, ready for checkout.',
    invalidTitle: 'Oho! We could not find that item',
    invalidBody: 'The link may be incomplete, or the item is no longer on sale. Head back to our site to pick it again.',
    emptyLink: 'Take Me Home',
    remove: 'Remove',
    subtotal: 'Subtotal',
    discounts: 'Discounts',
    total: 'Total',
    preLoginNote:
      'Taxes and other charges if applicable, would be computed once user validates their mobile number. Please authenticate your mobile number to redeem Gift Codes',
    codePlaceholder: 'Gift card or discount code',
    apply: 'Apply',
    codeInvalid: 'This gift card or discount code is not valid',
    pricesUpdated: 'Prices in your cart were out of date and have been refreshed.',
    itemsRemoved: 'Some items are no longer on sale and were removed from your cart.',
  },

  login: {
    title: 'Login / Register',
    body: 'Please enter your mobile number to continue.',
    mobilePlaceholder: 'Mobile number',
    mobileInvalid: 'Invalid Mobile Number',
    mobileToast: 'Enter a valid mobile number',
    continue: 'Continue',
    otpSent: 'One-time passcode sent',
    otpTitle: 'Continue',
    otpAs: (masked: string) => `as ${masked}`,
    otpBody: 'Please enter the one-time passcode.',
    otpDigit: (n: number) => `OTP digit ${n}`,
    otpIncomplete: (n: number) => `Please enter all ${n} digits of one-time passcode`,
    loginNow: 'Login Now',
    changeNumber: 'Change number',
    resendIn: (s: number) => `Resend passcode in ${s}s`,
    resend: 'Resend passcode',
    notReceived: 'Still no passcode? Email us.',
    loggedIn: 'Logged in',
    loggedInAs: (name: string) => `as ${name}`,
    logout: 'Logout',
  },

  billing: {
    title: 'Billing Address',
    body: 'We need these details for your invoice.',
    fullname: 'Full Name',
    address: 'Address',
    locality: 'Locality or Landmark',
    city: 'City',
    state: 'State',
    pincode: 'Pincode',
    email: 'Email for Communication',
    pincodeInvalid: 'Enter a valid 6-digit Indian pincode',
    pincodeUnknown: 'We could not match this pincode. Please choose your state and city.',
    stateMismatch: (state: string) => `This pincode belongs to ${state}. Please check the pincode or the state.`,
    emailInvalid: 'Enter a valid email address, like name@example.com',
  },

  terms: {
    before: 'By placing this order, you agree to our ',
    terms: 'Terms of Service',
    and: ' and ',
    refund: 'Refund Policy',
    understand: ', and understand our ',
    privacy: 'Privacy Policy',
    contactBefore: 'Please contact us at ',
    contactOr: ' or ',
    contactAfter: ' for any assistance.',
  },

  pay: {
    button: 'Pay Now',
    hintLogin: 'Please verify your mobile number to proceed.',
    hintBilling: 'Please add your billing address to proceed.',
    verifying: 'Confirming your payment',
    cancelledReason: 'the payment was cancelled before it was completed',
    notInitiated: 'Something went wrong, payment was not initiated',
  },

  result: {
    successTitle: 'Your payment is successful!',
    successBody: 'Thank you. Your order is confirmed.',
    failedTitle: 'Your payment has failed!',
    failedBody: 'Your order is not confirmed yet. Your cart is saved, so you can try again.',
    failedReason: (reason: string) => `Reason: ${reason}.`,
    failedDebited: 'If any amount was debited, your bank will usually return it within 5 to 7 working days.',
    retry: 'Retry Payment',
    unconfirmedTitle: 'We could not confirm your payment',
    unconfirmedBody:
      'Your payment went through at the bank, but we could not confirm it on our side. Please do not pay again. Contact us with the payment reference below and we will sort it out.',
    amountDue: 'Amount due',
    amountPaid: 'Amount paid',
    orderNumber: 'Order number',
    paymentRef: 'Payment reference',
    date: 'Date',
    redirectIn: (s: number) => `You will be taken to the Students Portal in ${s} second${s === 1 ? '' : 's'}`,
    redirecting: 'Taking you to the Students Portal',
    clickHere: 'Click here',
    clickHereRest: ' if you are not redirected to the Students Portal',
    receipt: 'Print or save receipt',
  },

  errors: {
    network: 'We could not reach the server. Check your connection and try again.',
    generic: 'Something went wrong',
    server: 'Something went wrong',
    unauthenticated: 'Your session has ended. Please login again.',
    item_unavailable: 'Course selected is invalid or no more available for purchase',
  } as Record<string, string>,

  notFoundPage: {
    title: 'Oho! There is nothing here',
    body: 'This page does not exist. The link may be mistyped or out of date.',
  },
}
