// The add-to-cart bridge.
//
// The main site (crisprlearning.com) cannot write this site's cart, so its Add to Cart buttons load
// /bridge.html?addItem=CB001 in a hidden frame. This page adds the item exactly as /cart?addItem= does and
// tells the main site how it went, so the student stays on the page they were on. &selection= works here too.
//
// It posts two messages to the page that frames it, both with source: 'crispr-checkout':
//   { type: 'cart-bridge', ready: true }                          at once, so the main site knows the bridge is there
//   { type: 'cart-add', ok: true, code, title, added, count }     added is false when a course or test series was already in the cart
//   { type: 'cart-add', ok: false, code, error, count }           error is an ApiErrorCode
// With /bridge.html?list=1 it adds nothing and instead reports what the cart holds, for the main site's cart dropdown:
//   { type: 'cart-list', count, items: [{ code, title, image, quantity, countable, type }] }
//   countable is true for books and merchandise, the only items that can have more than one copy.
//   type is what the item is, for display: 'Book', 'Merchandise', 'Course', 'Test Series'.
// The count is also in the crisprCartCount cookie (src/lib/cart.ts), which the main site reads for its cart icon.

import { api, ApiError } from './api'
import { MAIN_SITE_URL } from './config'
import { addToCart, cartCount, isDelivered, ITEM_ID, retrieveCart } from './lib/cart'

const MAIN = new URL(MAIN_SITE_URL)

/** The origin of the page this one is framed in, when that is the main site (or a local page in development). */
function parentOrigin(): string | null {
  if (window.parent === window) return null
  let named = window.location.ancestorOrigins?.[0] ?? ''
  if (!named && document.referrer) {
    try {
      named = new URL(document.referrer).origin
    } catch {
      named = ''
    }
  }
  if (named === MAIN.origin || named === `${MAIN.protocol}//www.${MAIN.host}`) return named
  if (import.meta.env.DEV && /^http:\/\/localhost(:\d+)?$/.test(named)) return named
  return null
}

async function run() {
  // Any other site framing this page gets no answer and adds nothing.
  const origin = parentOrigin()
  if (!origin) return
  const say = (message: object) => window.parent.postMessage({ source: 'crispr-checkout', ...message }, origin)
  say({ type: 'cart-bridge', ready: true })

  const params = new URLSearchParams(window.location.search)
  if (params.has('list')) {
    const lines = retrieveCart()
    say({
      type: 'cart-list',
      count: cartCount(lines),
      // Names, pictures and copies only: prices are settled on the cart page.
      items: lines.map((line) => ({
        code: line.itemId,
        title: line.title,
        image: line.displayImage ?? '',
        quantity: line.number,
        countable: isDelivered(line),
        type: line.isBook ? 'Book' : line.isMerch ? 'Merchandise' : (line.type ?? ''),
      })),
    })
    return
  }
  const code = params.get('addItem') ?? ''
  try {
    if (!ITEM_ID.test(code)) throw new ApiError('item_unavailable')
    // The catalogue decides the title, type, price and options.
    const item = await api.lookupItem(code)
    const before = cartCount(retrieveCart())
    const count = cartCount(addToCart(item, params.get('selection')))
    say({ type: 'cart-add', ok: true, code, title: item.title, added: count > before, count })
  } catch (err) {
    say({ type: 'cart-add', ok: false, code, error: err instanceof ApiError ? err.code : 'server', count: cartCount(retrieveCart()) })
  }
}

void run()
