import { useEffect, useRef, useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { AnimatePresence, MotionConfig, motion, useInView, useScroll, useTransform } from "motion/react";
import { loginWithGoogle, setAuthToken } from "../api/client";
import {
  AnimatedNumber, BorderTrail, InView, InfiniteSlider, Spotlight, TextEffect, Tilt, Waveform,
} from "./landing/primitives";
import { ChapterMock, CmsMock, ContextFlow, DashboardMock, ReaderMock, ShareMock } from "./landing/mocks";
import "./landing/landing.css";

interface Props {
  onLogin: (user: { email: string; name: string }) => void;
}

// ── Pricing — edit here ─────────────────────────────────────────────────────
const PRICE = 210;
const PRICE_TERM = "one-time · per author";
const PRICE_FEATURES = [
  "Record in the app or upload audio — up to 2½ hours per recording",
  "Bring what you've written: manuscript or chapter PDFs, or type it in",
  "Chapters written in your voice, each one remembering the last",
  "A human editor reviews every chapter before it's published to you",
  "Read, listen aloud, download PDFs and share chapters to your AI",
  "Private by default — only you and your editor see your book",
];

const BOOK_KINDS = [
  "Memoir", "Family history", "Founder story", "Novel", "Travel journal", "Letters to my kids",
  "Faith journey", "Recipe & memory book", "War & service", "Immigration story", "Life lessons", "Love story",
];

const STORY = [
  {
    kicker: "Night one",
    title: "She didn't write. She just talked.",
    body: "Maya opened Chapter 1, pressed Record and told the story of the lighthouse the way she'd tell a friend — out of order, with tangents, for forty minutes. Long recordings are fine; Inkwell handles up to two and a half hours at a time.",
    stage: "record",
  },
  {
    kicker: "Week one",
    title: "Some of it was already on paper.",
    body: "She had a half-finished draft and a folder of notes. She uploaded the draft as a PDF, typed a few paragraphs straight into the chapter, and used + Add more to line up voice, pages and text in exactly the order she wanted.",
    stage: "parts",
  },
  {
    kicker: "Week two",
    title: "Her chapters started writing themselves.",
    body: "Each chapter is written from her own words — polished, never invented — and carries a summary of the one before it, so Chapter 3 knows what happened in Chapter 2. The storm she mentioned once in passing came back exactly when it should.",
    stage: "book",
  },
  {
    kicker: "Week four",
    title: "An editor read every page.",
    body: "Before anything reached her, a human editor on our team reviewed each chapter in the studio, fixed what needed fixing, and sent it to her when it was ready.",
    stage: "cms",
  },
  {
    kicker: "Week six",
    title: "Then she listened to her own book.",
    body: "She played Chapter 3 aloud on the drive to her daughter's, downloaded the PDF for her brother, and shared it with her AI assistant to brainstorm a title. The lighthouse book was real.",
    stage: "read",
  },
] as const;

const FAQ = [
  { q: "Do I need to be a writer?", a: "No. Most authors never type a sentence — they talk. If you have written something, upload it or paste it in and it becomes part of the chapter." },
  { q: "Will it still sound like me?", a: "Yes. Chapters are written from your own recordings and pages, keeping your voice and your details. Nothing is invented, and an editor reviews every chapter." },
  { q: "How long can a recording be?", a: "Up to about two and a half hours per recording, and as many recordings per chapter as you like. You can also upload audio you've recorded elsewhere." },
  { q: "I've already written part of my book.", a: "Upload the whole manuscript as a PDF and we turn it into chapters, or attach a PDF to a single chapter. Your text is polished and kept; new recordings continue the story from there." },
  { q: "Who can see my book?", a: "Only you and the editor working on it. Your book is never published anywhere unless you choose to share it." },
  { q: `What does $${PRICE} include?`, a: "Everything on this page for your book: recording, uploads, chapter writing with memory across chapters, editor review, the reader, audio playback, PDFs and Share to AI." },
];

export default function LandingPage({ onLogin }: Props) {
  const [showSignIn, setShowSignIn] = useState(false);
  const [authError, setAuthError]   = useState<string | null>(null);
  const [adminUser, setAdminUser]   = useState<{ email: string; name: string } | null>(null);
  const start = () => setShowSignIn(true);

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
    <MotionConfig reducedMotion="user">
      <div className="lx">
        <Nav onStart={start} />
        <Hero onStart={start} />

        <section className="lx-kinds">
          <p className="lx-kinds-label">Books our authors are writing</p>
          <InfiniteSlider duration={45}>
            {BOOK_KINDS.map((k) => <span key={k} className="lx-kind">✦ {k}</span>)}
          </InfiniteSlider>
        </section>

        <Bento />
        <Story />
        <Numbers />
        <Pricing onStart={start} />
        <Faq />

        <section className="lx-final">
          <div className="lx-final-glow" aria-hidden />
          <InView className="lx-final-inner">
            <h2 className="lx-h2 lx-final-h">Your story is already in you.<br /><em>Let's get it on the page.</em></h2>
            <p className="lx-final-sub">Press record tonight. Read your first chapter this week.</p>
            <button className="lx-cta lx-cta-light" onClick={start}>Start your book — ${PRICE}<span className="lx-cta-arrow">→</span></button>
          </InView>
        </section>

        <footer className="lx-footer">
          <div className="lx-brand"><span className="lx-mark">I</span> Inkwell</div>
          <p>Your story. Your voice. Your book.</p>
          <div className="lx-footer-links">
            <a href="#story">How it works</a><a href="#pricing">Pricing</a><a href="#faq">FAQ</a>
            <button onClick={start}>Sign in</button>
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
              <h2 className="lp-signin-title">Begin your book</h2>
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
    </MotionConfig>
  );
}

// ── Sections ─────────────────────────────────────────────────────────────────

function Nav({ onStart }: { onStart: () => void }) {
  const { scrollY } = useScroll();
  const bg = useTransform(scrollY, [0, 80], ["rgba(9,9,18,0)", "rgba(9,9,18,0.72)"]);
  const border = useTransform(scrollY, [0, 80], ["rgba(255,255,255,0)", "rgba(255,255,255,0.07)"]);
  return (
    <motion.nav className="lx-nav" style={{ background: bg, borderColor: border }}>
      <div className="lx-nav-inner">
        <a className="lx-brand" href="#top"><span className="lx-mark">I</span> Inkwell</a>
        <div className="lx-nav-links">
          <a href="#product">Product</a><a href="#story">How it works</a><a href="#pricing">Pricing</a><a href="#faq">FAQ</a>
        </div>
        <div className="lx-nav-right">
          <button className="lx-nav-signin" onClick={onStart}>Sign in</button>
          <button className="lx-cta lx-cta-sm" onClick={onStart}>Start your book</button>
        </div>
      </div>
    </motion.nav>
  );
}

function Hero({ onStart }: { onStart: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const shotY = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const shotScale = useTransform(scrollYProgress, [0, 1], [1, 0.94]);
  return (
    <header className="lx-hero" id="top" ref={ref}>
      <Spotlight />
      <div className="lx-aurora" aria-hidden><span /><span /><span /></div>
      <div className="lx-grid" aria-hidden />

      <div className="lx-hero-copy">
        <motion.a href="#story" className="lx-pill" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <span className="lx-pill-new">New</span> Voice, pages or both — in any order <span aria-hidden>→</span>
        </motion.a>
        <h1 className="lx-h1">
          <TextEffect>Speak your story.</TextEffect><br />
          <TextEffect delay={0.35}>We'll make it a</TextEffect>{" "}
          <motion.em className="lx-ember-text" initial={{ opacity: 0, scale: 0.9, filter: "blur(10px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }} transition={{ delay: 0.75, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}>
            book.
          </motion.em>
        </h1>
        <InView delay={0.9} y={16}>
          <p className="lx-lead">
            Inkwell turns your voice notes, drafts and memories into finished chapters — written in your words,
            reviewed by a real editor, ready to read, hear and share.
          </p>
          <div className="lx-hero-ctas">
            <button className="lx-cta" onClick={onStart}><span className="lx-cta-shine" />Start your book<span className="lx-cta-arrow">→</span></button>
            <a className="lx-cta-ghost" href="#story">See how it works</a>
          </div>
          <div className="lx-trust">
            <span>${PRICE} {PRICE_TERM.split(" · ")[0]}</span><i /><span>Editor-reviewed chapters</span><i /><span>Private by default</span>
          </div>
        </InView>
      </div>

      <motion.div className="lx-hero-shot" style={{ y: shotY, scale: shotScale }}
        initial={{ opacity: 0, y: 60, rotateX: 18 }} animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ delay: 0.5, duration: 1.1, ease: [0.22, 1, 0.36, 1] }}>
        <Tilt max={4}><DashboardMock /></Tilt>
        <motion.div className="lx-float lx-float-rec" initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.4 }}>
          <span className="lx-rec-dot" /> Recording · Chapter 4
          <Waveform bars={26} height={22} className="lx-float-wave" />
        </motion.div>
        <motion.div className="lx-float lx-float-ctx" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.7 }}>
          <span className="lx-float-ic">✦</span>
          <div><b>Writing Chapter 3</b><span>with what happened in Chapter 2</span></div>
        </motion.div>
        <motion.div className="lx-float lx-float-pub" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.0 }}>
          <span className="lx-check">✓</span> Chapter 2 published to you
        </motion.div>
      </motion.div>
    </header>
  );
}

function Bento() {
  return (
    <section className="lx-section" id="product">
      <InView className="lx-head">
        <p className="lx-eyebrow">The product</p>
        <h2 className="lx-h2">Everything a first book needs.<br /><em>Nothing it doesn't.</em></h2>
      </InView>
      <div className="lx-bento">
        <InView className="lx-tile lx-tile-tall">
          <div className="lx-tile-copy">
            <h3>Talk, upload, type — in one place</h3>
            <p>Every chapter takes recordings, audio files, PDFs and typed text. Add more parts and they're written in exactly that order.</p>
          </div>
          <div className="lx-tile-shot"><ChapterMock /></div>
        </InView>
        <InView className="lx-tile" delay={0.08}>
          <div className="lx-tile-copy">
            <h3>Every chapter remembers the last</h3>
            <p>A summary of each chapter flows into the next, so threads and characters carry through the whole book.</p>
          </div>
          <ContextFlow />
        </InView>
        <InView className="lx-tile" delay={0.16}>
          <div className="lx-tile-copy">
            <h3>Long recordings welcome</h3>
            <p>Ramble for hours. We transcribe it all and keep every detail in order.</p>
          </div>
          <div className="lx-big-stat"><AnimatedNumber value={150} /><span>min per recording</span></div>
          <Waveform bars={40} height={30} className="lx-tile-wave" />
        </InView>
        <InView className="lx-tile lx-tile-wide" delay={0.08}>
          <div className="lx-tile-copy">
            <h3>Read it. Hear it. Share it.</h3>
            <p>A beautiful reader with listen-aloud, one-click PDFs, and Share to AI for ChatGPT, Claude or Gemini.</p>
          </div>
          <div className="lx-tile-shot lx-tile-shot-row">
            <div className="lx-tile-reader"><ReaderMock /></div>
            <div className="lx-tile-share"><ShareMock /></div>
          </div>
        </InView>
      </div>
    </section>
  );
}

function StoryStep({ step, i, onActive }: { step: typeof STORY[number]; i: number; onActive: (i: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.6 });
  useEffect(() => { if (inView) onActive(i); }, [inView, i, onActive]);
  return (
    <div ref={ref} className="lx-step">
      <span className="lx-step-n">{String(i + 1).padStart(2, "0")}</span>
      <p className="lx-step-kicker">{step.kicker}</p>
      <h3 className="lx-step-title">{step.title}</h3>
      <p className="lx-step-body">{step.body}</p>
      <div className="lx-step-stage-mobile"><Stage stage={step.stage} /></div>
    </div>
  );
}

function Stage({ stage }: { stage: typeof STORY[number]["stage"] }) {
  switch (stage) {
    case "record": return <ChapterMock compact />;
    case "parts":  return <ChapterMock />;
    case "book":   return <DashboardMock />;
    case "cms":    return <CmsMock />;
    case "read":   return <div className="lx-stage-read"><ReaderMock /><div className="lx-stage-share"><ShareMock /></div></div>;
  }
}

function Story() {
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start center", "end center"] });
  return (
    <section className="lx-section lx-story" id="story">
      <InView className="lx-head">
        <p className="lx-eyebrow">How it works</p>
        <h2 className="lx-h2">Meet Maya. <em>Here's how her book got written.</em></h2>
        <p className="lx-head-sub">An example journey — from a first voice note to a book she could hold.</p>
      </InView>
      <div className="lx-story-grid" ref={ref}>
        <div className="lx-story-rail" aria-hidden>
          <motion.div className="lx-story-rail-fill" style={{ scaleY: scrollYProgress }} />
        </div>
        <div className="lx-story-steps">
          {STORY.map((s, i) => <StoryStep key={i} step={s} i={i} onActive={setActive} />)}
        </div>
        <div className="lx-story-stage">
          <div className="lx-story-sticky">
            <AnimatePresence mode="wait">
              <motion.div key={active}
                initial={{ opacity: 0, y: 24, scale: 0.97, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -16, scale: 0.98, filter: "blur(6px)" }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
                <Stage stage={STORY[active].stage} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

function Numbers() {
  const items = [
    { node: <AnimatedNumber value={2.5} decimals={1} suffix=" hrs" />, label: "of audio per recording" },
    { node: <AnimatedNumber value={3} />, label: "ways in — voice, PDF, typing" },
    { node: <AnimatedNumber value={0} />, label: "sentences you have to write" },
    { node: <AnimatedNumber value={1} />, label: "editor reading every chapter" },
  ];
  return (
    <section className="lx-numbers">
      {items.map((it, i) => (
        <InView key={i} className="lx-num" delay={i * 0.08}>
          <div className="lx-num-n">{it.node}</div>
          <div className="lx-num-l">{it.label}</div>
        </InView>
      ))}
    </section>
  );
}

function Pricing({ onStart }: { onStart: () => void }) {
  return (
    <section className="lx-section lx-pricing" id="pricing">
      <InView className="lx-head">
        <p className="lx-eyebrow">Pricing</p>
        <h2 className="lx-h2">One price. <em>Your whole book.</em></h2>
      </InView>
      <InView className="lx-price-wrap" delay={0.1}>
        <div className="lx-price-card">
          <BorderTrail duration={7} />
          <div className="lx-price-top">
            <span className="lx-price-tag">Author</span>
            <div className="lx-price">
              <span className="lx-price-cur">$</span><AnimatedNumber value={PRICE} />
            </div>
            <div className="lx-price-term">{PRICE_TERM}</div>
          </div>
          <ul className="lx-price-list">
            {PRICE_FEATURES.map((f) => (
              <li key={f}><svg viewBox="0 0 16 16" aria-hidden><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>{f}</li>
            ))}
          </ul>
          <button className="lx-cta lx-cta-block" onClick={onStart}><span className="lx-cta-shine" />Start your book<span className="lx-cta-arrow">→</span></button>
          <p className="lx-price-fine">Sign in with Google to create your private writing space.</p>
        </div>
      </InView>
    </section>
  );
}

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="lx-section lx-faq" id="faq">
      <InView className="lx-head">
        <p className="lx-eyebrow">Questions</p>
        <h2 className="lx-h2">Before you <em>begin.</em></h2>
      </InView>
      <div className="lx-faq-list">
        {FAQ.map((f, i) => (
          <InView key={i} delay={i * 0.04} y={14}>
            <button className={`lx-faq-q ${open === i ? "open" : ""}`} onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
              {f.q}
              <motion.span className="lx-faq-ic" animate={{ rotate: open === i ? 45 : 0 }}>+</motion.span>
            </button>
            <AnimatePresence initial={false}>
              {open === i && (
                <motion.div className="lx-faq-a" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
                  <p>{f.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </InView>
        ))}
      </div>
    </section>
  );
}
