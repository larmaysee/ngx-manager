import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as SonnerToaster } from 'sonner'
import Home from '@/pages/Home'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import Dashboard from '@/pages/Dashboard'
import Proxies from '@/pages/Proxies'
import SSLCertificates from '@/pages/SSLCertificates'
import ChangePassword from '@/components/ChangePassword'
import ProtectedRoute from '@/components/ProtectedRoute'

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-background">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/change-password" element={<ChangePassword />} />
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="/proxies" element={
              <ProtectedRoute>
                <Proxies />
              </ProtectedRoute>
            } />
            <Route path="/ssl" element={
              <ProtectedRoute>
                <SSLCertificates />
              </ProtectedRoute>
            } />
          </Routes>
          <Toaster />
          <SonnerToaster />
        </div>
      </Router>
    </AuthProvider>
  )
}

export default App
