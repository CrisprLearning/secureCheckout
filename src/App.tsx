import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { EmptyState } from './components/EmptyState'
import { Shell } from './components/Shell'
import { ToastProvider } from './components/Toast'
import { CartPage } from './pages/CartPage'
import { OrderPage } from './pages/OrderPage'
import { OrdersPage } from './pages/OrdersPage'
import { SessionProvider } from './session'
import { t } from './strings'

function NotFound() {
  return <EmptyState title={t.notFoundPage.title} body={t.notFoundPage.body} />
}

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <SessionProvider>
          <Shell>
            <Routes>
              <Route path="/" element={<Navigate to="/cart" replace />} />
              <Route path="/cart" element={<CartPage />} />
              <Route path="/order/:id" element={<OrderPage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Shell>
        </SessionProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}

export default App
