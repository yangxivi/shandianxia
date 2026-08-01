import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
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
  let mounted = true;
  useEffect(() => {
    mounted = true;
    let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (mounted) { setOk(false); setReady(true); }
    }, 5000);
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (timer) { clearTimeout(timer); timer = null; }
      setOk(!!data.session);
      setReady(true);
    }).catch(() => {
      if (!mounted) return;
      if (timer) { clearTimeout(timer); timer = null; }
      setOk(false);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (mounted) setOk(!!s);
    });
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
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
function RequireAdmin({ children }: { children: JSX.Element }) {
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const { message } = AntApp.useApp();
  let mounted = true;
  useEffect(() => {
    mounted = true;
    let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (mounted) { setIsAdmin(false); setReady(true); }
    }, 8000);
    (async () => {
      try {
        const { data: sdata } = await supabase.auth.getSession();
        if (!mounted) return;
        const uid = sdata.session?.user?.id;
        if (!uid) {
          if (timer) { clearTimeout(timer); timer = null; }
          setReady(true);
          return;
        }
        const { data, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", uid)
          .single();
        if (!mounted) return;
        if (timer) { clearTimeout(timer); timer = null; }
        if (error || !data) {
          setReady(true);
          return;
        }
        setIsAdmin(data.role === "admin");
        setReady(true);
      } catch {
        if (mounted) {
          if (timer) { clearTimeout(timer); timer = null; }
          setReady(true);
        }
      }
    })();
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, []);
  if (!ready) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center" }}>
        <Spin />
      </div>
    );
  }
  if (!isAdmin) {
    message.error("您没有管理后台权限，请使用抄表员填报页");
    return <Navigate to="/meter" replace />;
  }
  return children;
}
function AuthListener({ children }: { children: JSX.Element }) {
  const nav = useNavigate();
  const { message } = AntApp.useApp();
  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent).detail || "登录已过期";
      supabase.auth.signOut().finally(() => {
        localStorage.clear();
        message.error(msg + "，请重新登录");
        setTimeout(() => nav("/login", { replace: true }), 800);
      });
    };
    window.addEventListener("auth-expired", handler);
    return () => window.removeEventListener("auth-expired", handler);
  }, [nav, message]);
  return children;
}
export default function App() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  let mounted = true;
  useEffect(() => {
    mounted = true;
    let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (mounted) { setAuthed(false); setReady(true); }
    }, 5000);
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (timer) { clearTimeout(timer); timer = null; }
      setAuthed(!!data.session);
      setReady(true);
    }).catch(() => {
      if (!mounted) return;
      if (timer) { clearTimeout(timer); timer = null; }
      setAuthed(false);
      setReady(true);
    });
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, []);
  if (!ready) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center" }}>
        <Spin />
      </div>
    );
  }
  return (
    <AuthListener>
      <Routes>
        <Route path="/" element={<Navigate to={authed ? "/admin" : "/login"} replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/meter" element={<MeterPage />} />
        <Route
          path="/admin"
          element={
            <RequireAuth>
              <RequireAdmin>
                <AdminLayout />
              </RequireAdmin>
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
    </AuthListener>
  );
}
