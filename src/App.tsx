import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Home from './pages/Home';
import AdminDashboard from './pages/AdminDashboard';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import BusinessDashboard from './pages/BusinessDashboard';
import TicketPurchase from './pages/TicketPurchase';
import Reservation from './pages/Reservation';
import MyReservations from './pages/MyReservations';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      {/* MONOLITH 노이즈 텍스처 오버레이 */}
      <div className="noise-overlay"></div>
      
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/home" element={<Home />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/super-admin" element={<SuperAdminDashboard />} />
        <Route path="/business" element={<BusinessDashboard />} />
        <Route path="/tickets" element={<TicketPurchase />} />
        <Route path="/reservation" element={<Reservation />} />
        <Route path="/my-reservations" element={<MyReservations />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
