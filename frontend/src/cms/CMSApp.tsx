import { useEffect, useRef, useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { loginWithGoogle, setAuthToken } from "../api/client";
import { getAdminMe, cmsSearch, type SearchResult } from "./api/adminClient";
import UsersPage from "./pages/UsersPage";
import UserBooksPage from "./pages/UserBooksPage";
import BookDashboard from "./pages/BookDashboard";
import type { CmsUser, CmsBook } from "./api/adminClient";
import { AnimatePresence, motion } from "motion/react";
import { TextEffect } from "../components/landing/primitives";
import { isMac } from "../components/ui/CommandPalette";
import "./cms.css";
import "./cms-theme.css";
import "../components/ui/ui.css";

type View =
  | { page: "loading" }
  | { page: "login"; error?: string }
  | { page: "denied" }
  | { page: "users"; adminName: string; adminEmail: string }
  | { page: "books"; adminName: string; adminEmail: string; user: CmsUser }
  | { page: "dashboard"; adminName: string; adminEmail: string; user: CmsUser; book: CmsBook };

export default function CMSApp() {
  const [view, setView] = useState<View>({ page: "loading" });
  const [searchQ, setSearchQ]         = useState("");
  const [searchRes, setSearchRes]     = useState<SearchResult | null>(null);
  const [searchOpen, setSearchOpen]   = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K jumps to search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault(); searchInputRef.current?.focus(); setSearchOpen(true);
      }
      if (e.key === "Escape") { setSearchOpen(false); searchInputRef.current?.blur(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!searchQ.trim()) { setSearchRes(null); return; }
    const t = setTimeout(() => {
      cmsSearch(searchQ).then(setSearchRes).catch(() => {});
    }, 260);
    return () => clearTimeout(t);
  }, [searchQ]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

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
        <motion.div className="cms-card" initial={{ opacity: 0, y: 20, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
          <div className="ux-mark" style={{ marginBottom: 22 }}>I</div>
          <div className="cms-badge">Editor Studio</div>
          <h1><TextEffect>Inkwell</TextEffect> <em className="ux-ember-text">Studio</em></h1>
          <p>Sign in with your admin Google account to access the content management dashboard.</p>
          {view.error && (
            <div style={{ color: "#fb7185", fontSize: 13, marginBottom: 16 }}>{view.error}</div>
          )}
          <div className="cms-google-btn">
            <GoogleLogin onSuccess={handleGoogleSuccess} onError={() => setView({ page: "login", error: "Sign-in failed." })} />
          </div>
        </motion.div>
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

  const hasResults = searchRes && (searchRes.users.length > 0 || searchRes.books.length > 0);

  function goToUser(googleId: string, name: string | null, email: string) {
    setSearchQ(""); setSearchRes(null); setSearchOpen(false);
    setView({ page: "books", adminName, adminEmail,
      user: { id: 0, google_id: googleId, name, email, book_count: 0, book_titles: [], created_at: "" } });
  }

  return (
    <div className="cms-shell">
      {/* Top bar */}
      <header className="cms-topbar">
        <div className="cms-logo"><span className="cms-mark">I</span>Inkwell <span>Studio</span></div>
        {breadcrumb}

        {/* Global search */}
        <div className="cms-search-wrap" ref={searchRef}>
          <div className="cms-search-box">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <input
              ref={searchInputRef}
              className="cms-search-input"
              placeholder="Search users or books…"
              value={searchQ}
              onChange={(e) => { setSearchQ(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
            />
            {searchQ ? (
              <button className="cms-search-clear" onClick={() => { setSearchQ(""); setSearchRes(null); }}>×</button>
            ) : (
              <span className="cms-search-kbd"><kbd className="ux-kbd">{isMac ? "⌘" : "Ctrl"}</kbd><kbd className="ux-kbd">K</kbd></span>
            )}
          </div>
          {searchOpen && searchQ && (
            <div className="cms-search-dropdown">
              {!hasResults ? (
                <div className="cms-search-empty">No results for "{searchQ}"</div>
              ) : (
                <>
                  {(searchRes?.users ?? []).length > 0 && (
                    <div className="cms-search-group">
                      <div className="cms-search-group-label">Users</div>
                      {searchRes!.users.map((u) => (
                        <button key={u.google_id} className="cms-search-item"
                          onClick={() => goToUser(u.google_id, u.name, u.email)}>
                          <span className="cms-si-icon">👤</span>
                          <span className="cms-si-main">{u.name ?? u.email}</span>
                          {u.name && <span className="cms-si-sub">{u.email}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {(searchRes?.books ?? []).length > 0 && (
                    <div className="cms-search-group">
                      <div className="cms-search-group-label">Books</div>
                      {searchRes!.books.map((b) => (
                        <button key={b.id} className="cms-search-item"
                          onClick={() => goToUser(b.owner_google_id, b.owner_name, b.owner_email)}>
                          <span className="cms-si-icon">{b.genre === "memoir" ? "✍" : "📖"}</span>
                          <span className="cms-si-main">{b.title}</span>
                          <span className="cms-si-sub">{b.owner_name ?? b.owner_email}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

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
        <AnimatePresence mode="wait">
        <motion.div
          key={view.page === "dashboard" ? `d-${view.book.id}` : view.page === "books" ? `b-${view.user.google_id}` : view.page}
          initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        >
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
        </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
