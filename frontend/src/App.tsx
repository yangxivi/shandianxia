import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { App as AntApp, Spin } from "antd";
import Login from "./pages/Login";
import MeterPage from "./pages/MeterPage";
import AdminLayout from "./pages/admin/AdminLayout";
import Accounts from "./pages/admin/Accounts";
import Devices from "./pages/admin/Devices";
import Readings from "./pages/admin/Readings";
import Summary from "./pages/admin/Summary";
import QrPage from "./pages/admin/QrPage";
import { supabase } from "./lib/supabase";

function RequireAuth({ children }: { children: JSX.Element }) {
  const [ready, setReady] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setOk(!!data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setOk(!!s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center" }}>
        <Spin />
      </div>
    );
  }
  if (!ok) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session);
      setReady(true);
    });
  }, []);

  return (
    <AntApp>
      <Routes>
        <Route path="/" element={<Navigate to={authed ? "/admin" : "/login"} replace />} />
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
          <Route path="accounts" element={<Accounts />} />
          <Route path="qr" element={<QrPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AntApp>
  );
}
