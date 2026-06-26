import { useEffect, useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { loginWithGoogle, setAuthToken } from "../api/client";
import { getAdminMe } from "./api/adminClient";
import UsersPage from "./pages/UsersPage";
import UserBooksPage from "./pages/UserBooksPage";
import BookDashboard from "./pages/BookDashboard";
import type { CmsUser, CmsBook } from "./api/adminClient";
import "./cms.css";

type View =
  | { page: "loading" }
  | { page: "login"; error?: string }
  | { page: "denied" }
  | { page: "users"; adminName: string; adminEmail: string }
  | { page: "books"; adminName: string; adminEmail: string; user: CmsUser }
  | { page: "dashboard"; adminName: string; adminEmail: string; user: CmsUser; book: CmsBook };

export default function CMSApp() {
  const [view, setView] = useState<View>({ page: "loading" });

  useEffect(() => {
    const token = localStorage.getItem("ink_token");
    if (!token) { setView({ page: "login" }); return; }
    getAdminMe()
      .then((me) => {
        if (!me.is_admin) { setView({ page: "denied" }); return; }
        setView({ page: "users", adminName: me.name, adminEmail: me.email });
      })
      .catch(() => setView({ page: "login" }));
  }, []);

  async function handleGoogleSuccess(cr: { credential?: string }) {
    if (!cr.credential) return;
    try {
      const data = await loginWithGoogle(cr.credential);
      setAuthToken(data.token);
      const me = await getAdminMe();
      if (!me.is_admin) { setView({ page: "denied" }); return; }
      setView({ page: "users", adminName: me.name, adminEmail: me.email });
    } catch {
      setView({ page: "login", error: "Sign-in failed. Please try again." });
    }
  }

  function handleSignOut() {
    localStorage.removeItem("ink_token");
    setView({ page: "login" });
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (view.page === "loading") {
    return (
      <div className="cms-center">
        <div className="cms-loading"><div className="cms-spinner" /> Checking access…</div>
      </div>
    );
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  if (view.page === "login") {
    return (
      <div className="cms-center">
        <div className="cms-card">
          <div className="cms-badge">Admin CMS</div>
          <h1>Inkwell Studio</h1>
          <p>Sign in with your admin Google account to access the content management dashboard.</p>
          {view.error && (
            <div style={{ color: "#fb7185", fontSize: 13, marginBottom: 16 }}>{view.error}</div>
          )}
          <div className="cms-google-btn">
            <GoogleLogin onSuccess={handleGoogleSuccess} onError={() => setView({ page: "login", error: "Sign-in failed." })} />
          </div>
        </div>
      </div>
    );
  }

  // ── Access denied ──────────────────────────────────────────────────────────
  if (view.page === "denied") {
    return (
      <div className="cms-center">
        <div className="cms-card">
          <div className="cms-badge" style={{ color: "#fb7185" }}>Access Denied</div>
          <h1>Not an admin</h1>
          <p>Your account doesn't have admin access. Contact the administrator to be added to the admin list.</p>
          <button className="cms-btn cms-btn-ghost" style={{ margin: "0 auto" }} onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  const adminName  = view.adminName;
  const adminEmail = view.adminEmail;

  // ── Breadcrumb ─────────────────────────────────────────────────────────────
  const breadcrumb = (
    <nav className="cms-breadcrumb">
      <a onClick={() => setView({ page: "users", adminName, adminEmail })}>Users</a>
      {(view.page === "books" || view.page === "dashboard") && (
        <>
          <span className="sep">/</span>
          {view.page === "books" ? (
            <span className="current">{view.user.name ?? view.user.email}</span>
          ) : (
            <a onClick={() => setView({ page: "books", adminName, adminEmail, user: (view as any).user })}>
              {(view as any).user.name ?? (view as any).user.email}
            </a>
          )}
        </>
      )}
      {view.page === "dashboard" && (
        <>
          <span className="sep">/</span>
          <span className="current">{view.book.title}</span>
        </>
      )}
    </nav>
  );

  return (
    <div className="cms-shell">
      {/* Top bar */}
      <header className="cms-topbar">
        <div className="cms-logo">Inkwell <span>CMS</span></div>
        {breadcrumb}
        <div className="cms-topbar-right">
          <div className="cms-user-pill">
            <div className="avatar">{(adminName?.[0] ?? adminEmail[0]).toUpperCase()}</div>
            <span>{adminName || adminEmail}</span>
          </div>
          <button className="cms-btn cms-btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }} onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="cms-body">
        {view.page === "users" && (
          <UsersPage
            onSelect={(user) => setView({ page: "books", adminName, adminEmail, user })}
          />
        )}

        {view.page === "books" && (
          <UserBooksPage
            user={view.user}
            onSelect={(book) => setView({ page: "dashboard", adminName, adminEmail, user: view.user, book })}
          />
        )}

        {view.page === "dashboard" && (
          <BookDashboard user={view.user} book={view.book} />
        )}
      </div>
    </div>
  );
}
