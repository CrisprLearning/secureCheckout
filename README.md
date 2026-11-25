# secureCheckout

Checkout for Crispr Learning, served at `securecheckout.crisprlearning.com` (GitHub Pages).
It takes a student from a Buy button on the main site through cart, OTP login, billing address, Razorpay
payment and a result screen, then sends them to the candidate portal.

React 19 + TypeScript + Vite. It is a static site that talks to the **live Crispr candidate APIs**, the same
PHP endpoints the candidate portal's own checkout (`candidate.crisprlearning.com/checkout`) uses. Prices,
discounts, taxes, payment signatures and enrolment are all decided by those APIs.

## Run

```bash
npm install
npm run dev
```

Open `/cart?addItem=CR0011` (any active catalogue code). There is no demo mode: logging in sends a real SMS
passcode, and Pay Now opens a real Razorpay payment.

## Configuration

Public build-time variables (see `.env.example`); all optional. For deploys, set them as repository **Variables**.

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE` | `https://crisprtech.app/crispr-apis` | The candidate APIs. |
| `VITE_PORTAL_URL` | `https://candidate.crisprlearning.com` | Where students go after paying. |
| `VITE_SHARED_LOGIN_COOKIE` | off | `true` keeps the login cookie on `.crisprlearning.com` so the portal is already logged in. See below. |

## Routes

| Path | Screen |
| --- | --- |
| `/cart?addItem={code}` | Cart, login, billing address, gift code, payment |
| `/payment` | Result of the last payment: success, failed (with Retry Payment) or paid-but-not-confirmed |

## Flow and API calls

`src/api/index.ts` is the only file that talks to the server.

| Step | Call |
| --- | --- |
| Add an item from the link | `POST public/courses.php?code=` |
| Send the passcode | `POST user/authenticate.php` `{ username }` → OTP key |
| Verify it | `POST user/login.php` `{ username, passcode, key }` → session token |
| Who is logged in, last billing address | `GET user/get-billing-address.php` |
| Price the cart | `POST user/checkout/validate-user-cart.php` `{ cart, code }` |
| Create the order | `POST user/checkout/process-purchase.php` `{ cart, discountCode, billingAddress }` → Razorpay key, order, amount |
| Confirm the payment | `POST user/checkout/acknowledge-purchase.php` → signature check and enrolment |

Notes on behaviour:

- **Cart.** Kept in `localStorage` (`src/lib/cart.ts`) in the portal's format; it can hold several items, one each
  of a course or test series. The server rejects a cart whose stored prices differ from its catalogue; the app
  then refreshes the lines from the catalogue and prices it once more.
- **Session.** The token from `login.php` is kept in the `crispriteUserToken` cookie for 7 days and sent as a
  Bearer token. The APIs report a bad token in the response body (HTTP 200), which logs the student out here.
- **Payment result.** There is no "get my order" API, so the result screen is built from what the browser knows
  and kept in `sessionStorage` for the tab. A payment Razorpay reports as successful but the server does not
  confirm is shown as "could not confirm", never as a failure with a retry.

## Logging in to the portal after payment

By default the login cookie belongs to this site only, so the portal asks the student to log in again.
`VITE_SHARED_LOGIN_COOKIE=true` sets the cookie for `.crisprlearning.com` instead, and the portal picks it up.
Before turning it on, change the portal's `clearToken()` to also clear the cookie with
`domain=.crisprlearning.com`; otherwise logging out of the portal leaves this cookie behind.

## Layout

- `src/strings.ts`: all interface text, in one place for translation.
- `src/config.ts`: URLs and environment settings.
- `src/api/`: API client and types.
- `src/pages/`, `src/components/`: screens and their parts.
- `src/lib/`: cart and token storage, payment result, formatting and validation, analytics events
  (pushed to `window.dataLayer`), Razorpay loader, pincode lookup.

The UI mirrors the candidate portal's checkout page; `src/index.css` starts from its stylesheet.

## Pincode data

`src/data/pincodes.json` maps every Indian pincode to its district and state (19,300 pincodes, 737 districts,
36 states and union territories). The billing form uses it to fill State and City from the pincode and to
populate both dropdowns, with no API call; it loads as its own chunk (about 53 KB gzipped).

It is built from India Post's All India Pincode Directory (data.gov.in, Government Open Data License):

```bash
python3 scripts/build-pincodes.py /path/to/pincode.csv
```

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`. `public/CNAME` and `public/.nojekyll` are copied
into the build, and the build writes `cart.html`, `payment.html` and `404.html` so app URLs load directly.
