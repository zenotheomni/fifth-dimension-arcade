import { Navigate, Route, Routes } from 'react-router-dom'
import LobbyPage from './pages/LobbyPage'
import CourtVisionPage from './pages/CourtVisionPage'
import FifthRunPage from './pages/FifthRunPage'
import ChallengePage from './pages/ChallengePage'
import KeyPage from './pages/KeyPage'
import ClaimPage from './pages/ClaimPage'
import AlertsCenter from './arcade/social/AlertsCenter'

export default function App() {
  return (
    <>
      <AlertsCenter />
      <Routes>
        <Route index element={<LobbyPage />} />
        <Route path="court-vision" element={<CourtVisionPage />} />
        <Route path="fifth-run" element={<FifthRunPage />} />
        <Route path="challenge/:id" element={<ChallengePage />} />
        <Route path="claim" element={<ClaimPage />} />
        <Route path="key" element={<KeyPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
