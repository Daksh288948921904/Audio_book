import { useEffect, useRef, useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { loginWithGoogle, setAuthToken } from "../api/client";

interface Props {
  onLogin: (user: { email: string; name: string }) => void;
}

function useInView(threshold = 0.1) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible] as const;
}

function Reveal({ children, className = "", delay = 0 }: {
  children: React.ReactNode; className?: string; delay?: number;
}) {
  const [ref, visible] = useInView();
  return (
    <section
      ref={ref}
      className={`lp-reveal ${visible ? "lp-revealed" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </section>
  );
}

const WAVE_BARS = 32;

const POSSIBLE = [
  { icon: "📖", title: "Your memoir", body: "A structured, readable account of your life — shaped by your voice, not a ghostwriter's." },
  { icon: "👨‍👩‍👧", title: "A legacy for family", body: "Stories your children and grandchildren will return to long after you're gone." },
  { icon: "🤍", title: "A gift to yourself", body: "The clarity and closure that comes from finally putting your story into words." },
  { icon: "🌐", title: "A voice in the world", body: "Your perspective, published — as an audiobook, ebook, or printed memoir." },
];

const STEPS = [
  { n: "01", title: "Speak freely", body: "No outline required. Just press record and tell your story the way you'd tell a friend — in whatever order it comes.", icon: "🎙" },
  { n: "02", title: "Watch it become a chapter", body: "Your words are shaped into polished prose — preserving your voice, your rhythm, your way of seeing the world. Nothing gets invented. Everything is you.", icon: "✦" },
  { n: "03", title: "Shape it into a book", body: "Review, refine, reorder. Build chapter by chapter until the full arc of your life is there on the page — exactly as you lived it.", icon: "📚" },
  { n: "04", title: "Share it — or keep it close", body: "Publish your audiobook, print it, or share it privately. Your story, your terms.", icon: "✉" },
];

const STORIES = [
  { title: "The immigrant journey", body: "What it cost to start over. What it built. What it meant." },
  { title: "The survival story", body: "The chapter of your life that changed everything — told finally, on your terms." },
  { title: "A life well lived", body: "Decades of experience, hard-earned wisdom, and a story worth preserving." },
  { title: "For the family", body: "Your parents' story. Your grandparents' story. Rescued before it disappears." },
];

export default function LandingPage({ onLogin }: Props) {
  const [showSignIn, setShowSignIn] = useState(false);
  const [authError, setAuthError]   = useState<string | null>(null);
  const [adminUser, setAdminUser]   = useState<{ email: string; name: string } | null>(null);

  async function handleGoogleSuccess(cr: { credential?: string }) {
    if (!cr.credential) return;
    setAuthError(null);
    try {
      const data = await loginWithGoogle(cr.credential);
      setAuthToken(data.token);
      if (data.is_admin) {
        setShowSignIn(false);
        setAdminUser({ email: data.email, name: data.name });
      } else {
        onLogin({ email: data.email, name: data.name });
      }
    } catch {
      setAuthError("Sign-in failed. Please try again.");
    }
  }

  return (
    <div className="lp">

      {/* ── Sticky nav ── */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <div className="lp-nav-brand">
            <div className="lp-brand-mark">I</div>
            <span className="lp-brand-name">Inkwell</span>
          </div>
          <button className="lp-nav-btn" onClick={() => setShowSignIn(true)}>Sign in →</button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <header className="lp-hero">
        {/* Background orbs */}
        <div className="lp-orb lp-orb-1" aria-hidden />
        <div className="lp-orb lp-orb-2" aria-hidden />
        <div className="lp-orb lp-orb-3" aria-hidden />
        {/* Grid */}
        <div className="lp-grid-bg" aria-hidden />

        <div className="lp-hero-text">
          <p className="lp-eyebrow">
            <span className="lp-eyebrow-dot" />
            AudioBook Studio
          </p>
          <h1 className="lp-h1">
            Your life<br />is a book.<br />
            <span className="lp-grad-text">It's time someone<br />finally wrote it.</span>
          </h1>
          <p className="lp-hero-lead">
            You've carried your story long enough. The moments that shaped you, the lessons that cost you, the journey no one else has lived — they deserve more than memory. They deserve permanence.
          </p>
          <p className="lp-hero-sub">
            Inkwell turns the way you already talk — naturally, from the heart — into a memoir you're proud to leave behind.
          </p>
          <div className="lp-hero-actions">
            <button className="lp-hero-cta" onClick={() => setShowSignIn(true)}>
              <span className="lp-cta-shimmer" />
              Start telling your story
              <span className="lp-cta-arrow">→</span>
            </button>
            <p className="lp-hero-note">Free to start · No writing required</p>
          </div>
        </div>

        <div className="lp-hero-visual" aria-hidden>
          {/* Glow rings */}
          <div className="lp-ring lp-ring-1" />
          <div className="lp-ring lp-ring-2" />
          <div className="lp-ring lp-ring-3" />

          {/* Mic orb */}
          <div className="lp-mic">
            <svg viewBox="0 0 48 48" fill="none">
              <rect x="16" y="3" width="16" height="26" rx="8" fill="url(#micGrad)"/>
              <path d="M8 24c0 8.837 7.163 16 16 16s16-7.163 16-16" stroke="url(#micGrad)" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
              <line x1="24" y1="40" x2="24" y2="46" stroke="#8B9BB4" strokeWidth="2.5" strokeLinecap="round"/>
              <line x1="17" y1="46" x2="31" y2="46" stroke="#8B9BB4" strokeWidth="2.5" strokeLinecap="round"/>
              <defs>
                <linearGradient id="micGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#5B8DEF"/>
                  <stop offset="100%" stopColor="#8B5CF6"/>
                </linearGradient>
              </defs>
            </svg>
          </div>

          {/* Waveform */}
          <div className="lp-waveform">
            {Array.from({ length: WAVE_BARS }, (_, i) => (
              <div
                key={i}
                className="lp-wbar"
                style={{ animationDelay: `${(i * 0.065).toFixed(3)}s` }}
              />
            ))}
          </div>

          {/* Recording pill */}
          <div className="lp-recording-pill">
            <span className="lp-rec-dot" /> Recording…
          </div>
        </div>
      </header>

      {/* ── Stats strip ── */}
      <Reveal className="lp-stats-strip">
        <div className="lp-stats-inner">
          {[
            { n: "~2 min", l: "Average voice recording" },
            { n: "1 session", l: "To complete a chapter" },
            { n: "∞", l: "Stories waiting to be told" },
          ].map((s, i) => (
            <div key={i} className="lp-stat">
              <div className="lp-stat-n">{s.n}</div>
              <div className="lp-stat-l">{s.l}</div>
            </div>
          ))}
        </div>
      </Reveal>

      {/* ── Quote ── */}
      <Reveal className="lp-section lp-section-mid">
        <div className="lp-inner">
          <p className="lp-eyebrow">The truth most writers never say out loud</p>
          <blockquote className="lp-quote">
            <span className="lp-big-quote">"</span>
            I've always known I had a book in me.<br />I just didn't know how to begin.
          </blockquote>
          <div className="lp-quote-body">
            <p>The blank page isn't the problem. The problem is that your story lives in you as <em>feeling</em>, not as sentences. You remember the smell of your grandmother's kitchen. The weight of a decision that changed everything. The moment you knew you'd survived something.</p>
            <p className="lp-pull">That's not a writing problem — that's a voice waiting to be heard.</p>
          </div>
        </div>
      </Reveal>

      {/* ── What's possible ── */}
      <Reveal className="lp-section">
        <div className="lp-inner">
          <p className="lp-eyebrow">What this makes possible</p>
          <h2 className="lp-h2">One conversation at a time,<br />your book takes shape.</h2>
          <div className="lp-grid-4">
            {POSSIBLE.map((c, i) => (
              <div key={i} className="lp-card" style={{ animationDelay: `${i * 90}ms` }}>
                <div className="lp-card-icon">{c.icon}</div>
                <h3 className="lp-card-title">{c.title}</h3>
                <p className="lp-card-body">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      {/* ── How it works ── */}
      <Reveal className="lp-section lp-section-mid">
        <div className="lp-inner lp-inner-wide">
          <p className="lp-eyebrow">How it works</p>
          <h2 className="lp-h2">You talk. Your book takes shape.</h2>
          <div className="lp-steps">
            {STEPS.map((s, i) => (
              <div key={i} className="lp-step" style={{ animationDelay: `${i * 100}ms` }}>
                <div className="lp-step-n">{s.n}</div>
                <div className="lp-step-content">
                  <span className="lp-step-icon">{s.icon}</span>
                  <h3 className="lp-step-title">{s.title}</h3>
                  <p className="lp-step-body">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      {/* ── Urgency (gradient band) ── */}
      <Reveal className="lp-section lp-section-gradient">
        <div className="lp-inner">
          <p className="lp-eyebrow lp-eyebrow-soft">For the writer who keeps saying "someday"</p>
          <h2 className="lp-h2 lp-h2-white">The time you've been waiting for<br />is right now.</h2>
          <p className="lp-body lp-body-soft">
            Memories fade. The people who lived through it with you won't always be here to fill the gaps. Every year you wait is a year your story gets a little harder to tell.
          </p>
          <p className="lp-body lp-body-soft">
            You don't need to write a single word. You just need to start talking.
          </p>
          <button className="lp-hero-cta lp-cta-glass" onClick={() => setShowSignIn(true)}>
            Begin your memoir today
            <span className="lp-cta-arrow">→</span>
          </button>
        </div>
      </Reveal>

      {/* ── Story types ── */}
      <Reveal className="lp-section">
        <div className="lp-inner">
          <p className="lp-eyebrow">For every kind of story</p>
          <div className="lp-grid-4">
            {STORIES.map((c, i) => (
              <div key={i} className="lp-card lp-card-accent">
                <h3 className="lp-card-title">{c.title}</h3>
                <p className="lp-card-body">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      {/* ── Final CTA ── */}
      <Reveal className="lp-section lp-section-mid lp-final-cta">
        <div className="lp-inner lp-inner-center">
          <div className="lp-final-icon">✍</div>
          <h2 className="lp-h2">Every story deserves to be told.</h2>
          <p className="lp-body lp-body-center">
            Yours is no different. The only thing standing between you and your book is the first sentence — and you don't even have to write it.
          </p>
          <button className="lp-hero-cta" onClick={() => setShowSignIn(true)}>
            <span className="lp-cta-shimmer" />
            Start for free today
            <span className="lp-cta-arrow">→</span>
          </button>
        </div>
      </Reveal>

      {/* ── Footer ── */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-nav-brand">
            <div className="lp-brand-mark lp-brand-mark-sm">I</div>
            <span className="lp-brand-name">Inkwell</span>
          </div>
          <p className="lp-footer-tagline">Your story. Your voice. Your book.</p>
        </div>
      </footer>

      {/* ── Admin role picker ── */}
      {adminUser && (
        <div className="lp-overlay">
          <div className="lp-signin-card">
            <div className="lp-signin-logo">
              <div className="lp-brand-mark" style={{ width: 48, height: 48, fontSize: 20, borderRadius: 13 }}>I</div>
            </div>
            <h2 className="lp-signin-title">Where to?</h2>
            <p className="lp-signin-sub">Welcome back, {adminUser.name || adminUser.email}.</p>
            <div className="lp-signin-rule" />
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
              <button
                onClick={() => { window.location.href = "/cms"; }}
                style={{
                  background: "linear-gradient(135deg, #6d28d9, #8b5cf6)",
                  color: "#fff", border: "none", borderRadius: 10,
                  padding: "14px 20px", fontSize: 15, fontWeight: 700,
                  cursor: "pointer", textAlign: "left",
                }}
              >
                <div>⚙ Admin Panel</div>
                <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.8, marginTop: 3 }}>
                  Manage users, generate chapters, compile books
                </div>
              </button>
              <button
                onClick={() => onLogin(adminUser)}
                style={{
                  background: "rgba(255,255,255,0.06)", color: "#e4e4f0",
                  border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10,
                  padding: "14px 20px", fontSize: 15, fontWeight: 700,
                  cursor: "pointer", textAlign: "left",
                }}
              >
                <div>📖 User Panel</div>
                <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.6, marginTop: 3 }}>
                  Record segments, view your own books
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sign-in overlay ── */}
      {showSignIn && (
        <div
          className="lp-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setShowSignIn(false); }}
        >
          <div className="lp-signin-card">
            <button className="lp-signin-close" onClick={() => setShowSignIn(false)}>✕</button>
            <div className="lp-signin-logo">
              <div className="lp-brand-mark" style={{ width: 48, height: 48, fontSize: 20, borderRadius: 13 }}>I</div>
            </div>
            <h2 className="lp-signin-title">Begin your memoir</h2>
            <p className="lp-signin-sub">Sign in to create your private writing space.</p>
            <div className="lp-signin-rule" />
            {authError && <p className="lp-signin-error">{authError}</p>}
            <div className="lp-signin-google">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => setAuthError("Google sign-in failed.")}
                theme="filled_black"
                shape="rectangular"
                size="large"
                text="continue_with"
                width="280"
              />
            </div>
            <p className="lp-signin-fine">Your story is private. Only you can access your books.</p>
            <div className="lp-signin-badges">
              <span>🔒 Private</span>
              <span>☁ Cloud saved</span>
              <span>✦ Voice-powered</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
