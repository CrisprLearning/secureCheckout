import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { EmptyState } from './components/EmptyState'
import { Shell } from './components/Shell'
import { ToastProvider } from './components/Toast'
import { CartPage } from './pages/CartPage'
import { ResultPage } from './pages/ResultPage'
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
              <Route path="/payment" element={<ResultPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Shell>
        </SessionProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}

export default App
