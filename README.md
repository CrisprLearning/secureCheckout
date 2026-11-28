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
| `VITE_SHARED_LOGIN_COOKIE` | on | `false` keeps the login cookie on this site alone instead of sharing it with the portal. See below. |

## Routes

| Path | Screen |
| --- | --- |
| `/cart?addItem={code}` | Cart, login, billing address, gift code, payment |
| `/payment` | Result of the last payment: success, failed (with Retry Payment) or paid-but-not-confirmed |
| `/bridge.html?addItem={code}` | No screen. The main site loads it in a hidden frame to add an item without leaving its page (`src/bridge.ts`) |

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
- **Cart count for the main site.** `crisprlearning.com` cannot read this site's `localStorage`, so every change
  to the cart also writes the number of items to the `crisprCartCount` cookie on `.crisprlearning.com`
  (`publishCartCount` in `src/lib/cart.ts`). Copies count: two of one book is 2. An empty cart, or a completed
  purchase, removes the cookie. The main site reads it to badge its cart icon.
- **Add to cart from the main site.** An Add to Cart button on `crisprlearning.com` loads
  `/bridge.html?addItem={code}` in a hidden frame. The bridge adds the item as `/cart?addItem=` does and posts the
  result to the main site (`{ source: 'crispr-checkout', type: 'cart-add', ok, title, added, count }`), which shows
  a toast and updates its cart icon. It answers only when framed by the main site. If the bridge does not answer,
  the main site falls back to opening `/cart?addItem={code}`.
- **Session.** The token from `login.php` is kept in the `crispriteUserToken` cookie (shared with the portal) for 7 days and sent as a
  Bearer token. The APIs report a bad token in the response body (HTTP 200), which logs the student out here.
- **Coming from the portal.** The portal's Enroll links end in `#u=<mark>`, a short fingerprint of the mobile
  number logged in there (`src/lib/handoff.ts`). If this site holds a different candidate's login, it is logged
  out and the student logs in afresh. Links without the mark behave as before.
- **Payment result.** There is no "get my order" API, so the result screen is built from what the browser knows
  and kept in `sessionStorage` for the tab. A payment Razorpay reports as successful but the server does not
  confirm is shown as "could not confirm", never as a failure with a retry.

## One login with the portal

On `crisprlearning.com` the login cookie is set for the whole domain (`.crisprlearning.com`), and the portal
does the same (`src/lib/auth.js` there). A student logged in on the portal arrives here already logged in, one
who logs in here is logged in on the portal after paying, and logging out of either logs out of both.
A login made before this (a cookie of one site alone) is replaced by the shared one, or becomes it when there
is none. `VITE_SHARED_LOGIN_COOKIE=false` keeps the cookie on this site alone.

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
