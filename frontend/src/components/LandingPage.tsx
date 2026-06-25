import { useEffect, useRef, useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { loginWithGoogle, setAuthToken } from "../api/client";

interface Props {
  onLogin: (user: { email: string; name: string }) => void;
}

function useInView(threshold = 0.12) {
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

const WAVE_BARS = 28;

const POSSIBLE = [
  { icon: "📖", title: "Your memoir", body: "A structured, readable account of your life — shaped by your voice, not a ghostwriter's." },
  { icon: "👨‍👩‍👧", title: "A legacy for family", body: "Stories your children and grandchildren will return to long after you're gone." },
  { icon: "🤍", title: "A gift to yourself", body: "The clarity and closure that comes from finally putting your story into words." },
  { icon: "🌐", title: "A voice in the world", body: "Your perspective, published — as an audiobook, ebook, or printed memoir." },
];

const STEPS = [
  { n: "1", title: "Speak freely", body: "No outline required. No writing experience needed. Just press record and tell your story the way you'd tell a friend — in whatever order it comes." },
  { n: "2", title: "Watch it become a chapter", body: "Your words are shaped into polished prose — preserving your voice, your rhythm, your way of seeing the world. Nothing gets invented. Everything is you." },
  { n: "3", title: "Shape it into a book", body: "Review, refine, reorder. Build chapter by chapter until the full arc of your life is there on the page — exactly as you lived it." },
  { n: "4", title: "Share it — or keep it close", body: "Publish your audiobook, print it, or share it privately with the people it was written for. Your story, your terms." },
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

  async function handleGoogleSuccess(cr: { credential?: string }) {
    if (!cr.credential) return;
    setAuthError(null);
    try {
      const data = await loginWithGoogle(cr.credential);
      setAuthToken(data.token);
      onLogin({ email: data.email, name: data.name });
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
          <button className="lp-nav-btn" onClick={() => setShowSignIn(true)}>Sign in</button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <header className="lp-hero">
        <div className="lp-hero-text">
          <p className="lp-eyebrow">AudioBook Studio</p>
          <h1 className="lp-h1">
            Your life<br />is a book.<br />
            <em>It's time someone<br />finally wrote it.</em>
          </h1>
          <p className="lp-hero-lead">
            You've carried your story long enough. The moments that shaped you, the lessons that cost you, the journey no one else has lived — they deserve more than memory. They deserve permanence.
          </p>
          <p className="lp-hero-sub">
            Inkwell turns the way you already talk — naturally, from the heart — into a memoir you're proud to leave behind.
          </p>
          <button className="lp-hero-cta" onClick={() => setShowSignIn(true)}>
            Start telling your story
            <span className="lp-cta-arrow">→</span>
          </button>
          <p className="lp-hero-note">Free to start. No writing required.</p>
        </div>

        <div className="lp-hero-visual" aria-hidden>
          {/* Ripple rings */}
          <div className="lp-ripple lp-ripple-1" />
          <div className="lp-ripple lp-ripple-2" />
          <div className="lp-ripple lp-ripple-3" />

          {/* Mic */}
          <div className="lp-mic">
            <svg viewBox="0 0 48 48" fill="none">
              <rect x="16" y="3" width="16" height="26" rx="8" fill="#1C1C1A"/>
              <path d="M8 24c0 8.837 7.163 16 16 16s16-7.163 16-16" stroke="#1C1C1A" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
              <line x1="24" y1="40" x2="24" y2="46" stroke="#1C1C1A" strokeWidth="2.5" strokeLinecap="round"/>
              <line x1="17" y1="46" x2="31" y2="46" stroke="#1C1C1A" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </div>

          {/* Waveform */}
          <div className="lp-waveform">
            {Array.from({ length: WAVE_BARS }, (_, i) => (
              <div
                key={i}
                className="lp-wbar"
                style={{ animationDelay: `${(i * 0.07).toFixed(2)}s` }}
              />
            ))}
          </div>

          {/* Floating label */}
          <div className="lp-recording-pill">
            <span className="lp-rec-dot" /> Recording…
          </div>
        </div>
      </header>

      {/* ── Divider ── */}
      <div className="lp-divider-wave" aria-hidden>
        <svg viewBox="0 0 1440 40" preserveAspectRatio="none">
          <path d="M0,20 C360,40 1080,0 1440,20 L1440,40 L0,40 Z" fill="#EDE9DF"/>
        </svg>
      </div>

      {/* ── Quote ── */}
      <Reveal className="lp-section lp-section-tinted">
        <div className="lp-inner">
          <p className="lp-eyebrow">The truth most writers never say out loud</p>
          <blockquote className="lp-quote">
            <span className="lp-quote-mark">"</span>
            I've always known I had a book in me. I just didn't know how to begin.
            <span className="lp-quote-mark">"</span>
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
          <div className="lp-grid-4">
            {POSSIBLE.map((c, i) => (
              <div key={i} className="lp-card" style={{ animationDelay: `${i * 80}ms` }}>
                <div className="lp-card-icon">{c.icon}</div>
                <h3 className="lp-card-title">{c.title}</h3>
                <p className="lp-card-body">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      {/* ── How it works ── */}
      <Reveal className="lp-section lp-section-tinted">
        <div className="lp-inner lp-inner-wide">
          <p className="lp-eyebrow">How it works</p>
          <h2 className="lp-h2">You talk. Your book takes shape.</h2>
          <div className="lp-steps">
            {STEPS.map((s, i) => (
              <div key={i} className="lp-step">
                <div className="lp-step-n">{s.n}</div>
                <div>
                  <h3 className="lp-step-title">{s.title}</h3>
                  <p className="lp-step-body">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      {/* ── Urgency (dark band) ── */}
      <Reveal className="lp-section lp-section-dark">
        <div className="lp-inner">
          <p className="lp-eyebrow lp-eyebrow-inv">For the writer who keeps saying "someday"</p>
          <h2 className="lp-h2 lp-h2-inv">The time you've been waiting for is right now.</h2>
          <p className="lp-body lp-body-inv">
            Memories fade. The people who lived through it with you won't always be here to fill the gaps. Every year you wait is a year your story gets a little harder to tell.
          </p>
          <p className="lp-body lp-body-inv">
            You don't need to write a single word. You just need to start talking.
          </p>
          <button className="lp-hero-cta lp-cta-inv" onClick={() => setShowSignIn(true)}>
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
              <div key={i} className="lp-card lp-card-bare">
                <h3 className="lp-card-title">{c.title}</h3>
                <p className="lp-card-body">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      {/* ── Final CTA ── */}
      <Reveal className="lp-section lp-section-tinted lp-final-cta">
        <div className="lp-inner lp-inner-center">
          <div className="lp-final-icon">✍</div>
          <h2 className="lp-h2">Every story deserves<br />to be told.</h2>
          <p className="lp-body lp-body-center">
            Yours is no different. The only thing standing between you and your book is the first sentence — and you don't even have to write it.
          </p>
          <button className="lp-hero-cta" onClick={() => setShowSignIn(true)}>
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

      {/* ── Sign-in overlay ── */}
      {showSignIn && (
        <div
          className="lp-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setShowSignIn(false); }}
        >
          <div className="lp-signin-card">
            <button className="lp-signin-close" onClick={() => setShowSignIn(false)}>✕</button>
            <div className="lp-signin-icon">✍</div>
            <h2 className="lp-signin-title">Begin your memoir</h2>
            <p className="lp-signin-sub">Sign in to create your private writing space.</p>
            <div className="lp-signin-rule" />
            {authError && <p className="lp-signin-error">{authError}</p>}
            <div className="lp-signin-google">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => setAuthError("Google sign-in failed.")}
                theme="outline"
                shape="rectangular"
                size="large"
                text="continue_with"
                width="280"
              />
            </div>
            <p className="lp-signin-fine">
              Your story is private. Only you can access your books.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
