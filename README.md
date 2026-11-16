# secureCheckout

Checkout frontend for Crispr Learning, served at `securecheckout.crisprlearning.com` (GitHub Pages).
It takes a student from a Buy button on the main site through cart, OTP login, Razorpay payment and
confirmation, then hands off to the candidate portal.

React 19 + TypeScript + Vite. Static site: every rule that matters (prices, OTP, payment signatures,
sessions, entitlements) belongs to the backend it talks to.

## Run

```bash
npm install
npm run dev
```

Open `/cart?addItem=TS0001`. With no backend configured the app uses an in-browser **demo backend**
(`src/api/mock.ts`): OTP is `1234`, gift code is `CRISPR10`, payment is simulated, data lives in `localStorage`.
Demo items: `CR0001` course, `TS0001` and `PY0001` test series, `BK0001` book. PIN code `999999` is
treated as not deliverable for books.

## Cart

The cart holds several items and lives in `localStorage` (`src/lib/cart.ts`), as in the candidate portal.
Each `/cart?addItem=` link adds to it. Courses and test series are limited to one each; books add to their
count. Before login the cart shows stored prices; after login the server prices it (ownership, discount,
taxes, delivery, total) and only IDs and counts are ever sent from the browser.

## Look

The UI mirrors the candidate portal's checkout page (`candidatePortal/src/pages/CheckoutPage.jsx` and
`styles/pages/checkout.css`): same tokens, font, layout and class names. `src/index.css` is that stylesheet
plus a clearly marked block of additions.

## Configuration

Public build-time variables (see `.env.example`). For deploys, set them as repository **Variables**.

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | Checkout backend origin. Empty means demo mode, with a banner. |
| `VITE_PORTAL_URL` | Candidate portal origin. |
| `VITE_WHATSAPP_NUMBER` | Help link number, international format without `+`. |

## Routes

| Path | Screen |
| --- | --- |
| `/cart?addItem={itemId}&type={itemType}` | Cart, login, billing address, gift code, payment |
| `/order/{id}` | Confirmation and receipt; polls while payment is being confirmed |
| `/orders` | The student's order history |

## Backend contract

`src/api/types.ts` defines the `Api` interface and `src/api/http.ts` maps it to HTTP. The session is an
HttpOnly cookie (`credentials: 'include'`), so the backend must allow this origin with credentials.
Errors are JSON `{ "code": "..." }` using the codes in `ApiErrorCode`.

| Call | Request |
| --- | --- |
| Session | `GET /api/session` |
| OTP | `POST /api/auth/otp/request` (returns a key), `POST /api/auth/otp/verify`, `POST /api/auth/logout` |
| Catalogue | `GET /api/items/{id}` |
| Cart | `POST /api/cart/validate` with `{ cart: [{ itemId, number }], discountCode }` |
| Orders | `POST /api/orders`, `GET /api/orders`, `GET /api/orders/{id}` |
| Payment | `POST /api/payments/verify` (plus the Razorpay webhook, server side only) |
| Handoff | `POST /api/handoff` returns a single-use key for the portal redirect |

The candidate portal already talks to a PHP API for the same steps (`authenticate`, `login`, `courses`,
`validate-user-cart`, `process-purchase`, `acknowledge-purchase`). `src/api/http.ts` is not wired to it yet.

## Layout

- `src/strings.ts`: all interface text, in one place for translation.
- `src/config.ts`: URLs and environment settings.
- `src/api/`: types, HTTP client, demo backend.
- `src/pages/`, `src/components/`: screens and their parts.
- `src/lib/`: cart storage, formatting, analytics events (pushed to `window.dataLayer`), Razorpay loader.

## Pincode data

`src/data/pincodes.json` maps every Indian pincode to its district and state (19,300 pincodes, 737 districts,
36 states and union territories). The billing form uses it to fill State and City from the pincode and to
populate both dropdowns, with no API call; it loads as its own chunk (about 53 KB gzipped).

It is built from India Post's All India Pincode Directory (data.gov.in, Government Open Data License):

```bash
python3 scripts/build-pincodes.py /path/to/pincode.csv
```

A pincode served from several districts is assigned to the one with the most post offices. Re-run the script
with a newer CSV to pick up new pincodes and districts.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`. `public/CNAME` and `public/.nojekyll` are copied
into the build, and the build writes `cart.html`, `orders.html` and `404.html` so app URLs load directly.
