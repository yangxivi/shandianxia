import { Navigate, Route, Routes } from "react-router-dom";
import { App as AntApp } from "antd";
import Login from "./pages/Login";
import MeterPage from "./pages/MeterPage";
import AdminLayout from "./pages/admin/AdminLayout";
import Devices from "./pages/admin/Devices";
import Readings from "./pages/admin/Readings";
import Summary from "./pages/admin/Summary";
import QrPage from "./pages/admin/QrPage";

function RequireAuth({ children }: { children: JSX.Element }) {
  const token = localStorage.getItem("token");
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const token = localStorage.getItem("token");
  return (
    <AntApp>
      <Routes>
        <Route path="/" element={<Navigate to={token ? "/admin" : "/login"} replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/meter" element={<MeterPage />} />
        <Route
          path="/admin"
          element={
            <RequireAuth>
              <AdminLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Summary />} />
          <Route path="summary" element={<Summary />} />
          <Route path="devices" element={<Devices />} />
          <Route path="readings" element={<Readings />} />
          <Route path="qr" element={<QrPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AntApp>
  );
}
