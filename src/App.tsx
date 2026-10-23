import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import LobbyPage from './pages/LobbyPage'
import CourtVisionPage from './pages/CourtVisionPage'
import FifthRunPage from './pages/FifthRunPage'
import FifthFramePage from './pages/FifthFramePage'
import ChallengePage from './pages/ChallengePage'
import KeyPage from './pages/KeyPage'
import ClaimPage from './pages/ClaimPage'
import AlertsCenter from './arcade/social/AlertsCenter'

const AdminPage = lazy(() => import('./pages/AdminPage'))

export default function App() {
  return (
    <>
      <AlertsCenter />
      <Routes>
        <Route index element={<LobbyPage />} />
        <Route path="court-vision" element={<CourtVisionPage />} />
        <Route path="fifth-run" element={<FifthRunPage />} />
        <Route path="fifth-glide" element={<FifthRunPage />} />
        <Route path="street-shift" element={<Navigate to="/" replace />} />
        <Route path="nova-slide" element={<Navigate to="/" replace />} />
        <Route path="nova-5" element={<Navigate to="/" replace />} />
        <Route path="fifth-frame" element={<FifthFramePage />} />
        <Route path="challenge/:id" element={<ChallengePage />} />
        <Route path="claim" element={<ClaimPage />} />
        <Route path="key" element={<KeyPage />} />
        <Route
          path="admin"
          element={
            <Suspense fallback={null}>
              <AdminPage />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
