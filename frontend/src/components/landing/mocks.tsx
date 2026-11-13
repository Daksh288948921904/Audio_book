// Product "screenshots" for the landing page — live, animated replicas of the real
// screens (book dashboard, chapter popup, reader, CMS, Share to AI), drawn in code
// so they stay crisp at any size and match the app.
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Typewriter, Waveform } from "./primitives";

const GRADIENTS = [
  "linear-gradient(145deg, #0f1f3d 0%, #1a3a6b 55%, #2a4f8f 100%)",
  "linear-gradient(145deg, #1a0d2e 0%, #3d1a6e 55%, #5a2d9e 100%)",
  "linear-gradient(145deg, #062520 0%, #0d4a3f 55%, #1a7060 100%)",
  "linear-gradient(145deg, #2a0612 0%, #5c0e24 55%, #8a1c3c 100%)",
  "linear-gradient(145deg, #1f1000 0%, #4a2a00 55%, #7a4a0a 100%)",
  "linear-gradient(145deg, #0d0d1f 0%, #1c1c3d 55%, #2c2c6a 100%)",
];

export function Window({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={`lx-window ${className}`}>
      <div className="lx-window-bar">
        <span className="lx-dot" style={{ background: "#FF5F57" }} />
        <span className="lx-dot" style={{ background: "#FEBC2E" }} />
        <span className="lx-dot" style={{ background: "#28C840" }} />
        <span className="lx-window-url">{title}</span>
      </div>
      <div className="lx-window-body">{children}</div>
    </div>
  );
}

function Badge({ kind }: { kind: "done" | "writing" | "recording" }) {
  const label = { done: "Complete", writing: "Writing", recording: "Recording" }[kind];
  return (
    <span className={`lx-badge lx-badge-${kind}`}>
      {kind === "writing" ? <span className="lx-spin" /> : <span className="lx-pip" />}
      {label}
    </span>
  );
}

// ── Book dashboard ───────────────────────────────────────────────────────────
const CHAPTERS: { n: string; title: string; kind: "done" | "writing" | "recording"; recs: number; excerpt?: string }[] = [
  { n: "01", title: "The Light on Carrow Point", kind: "done", recs: 6, excerpt: "The lamp had burned every night for ninety years, and Maya had never once let it go dark…" },
  { n: "02", title: "A Letter for My Father", kind: "done", recs: 4, excerpt: "The envelope was older than she was, its wax seal cracked like a dry riverbed…" },
  { n: "03", title: "The Storm", kind: "writing", recs: 5 },
  { n: "04", title: "Elias", kind: "recording", recs: 3 },
  { n: "05", title: "What the Sea Kept", kind: "recording", recs: 1 },
  { n: "06", title: "Dawn", kind: "recording", recs: 0 },
];

export function DashboardMock() {
  return (
    <Window title="inkwell.app / The Lighthouse Keeper">
      <div className="lx-dash">
        <aside className="lx-dash-side">
          <div className="lx-dash-logo"><span className="lx-mark">I</span> Inkwell</div>
          <div className="lx-dash-label">Your books</div>
          {["The Lighthouse Keeper", "Letters to Ava", "Fifty Summers"].map((b, i) => (
            <div key={b} className={`lx-dash-book ${i === 0 ? "active" : ""}`}>
              <span className="lx-dash-book-ic">{["📘", "📗", "📙"][i]}</span>{b}
            </div>
          ))}
        </aside>
        <div className="lx-dash-main">
          <div className="lx-dash-head">
            <div>
              <div className="lx-dash-kicker">Memoir</div>
              <div className="lx-dash-title">The Lighthouse Keeper</div>
            </div>
            <div className="lx-dash-stats">
              <div><b>2</b><span>Complete</span></div>
              <div><b>19</b><span>Recordings</span></div>
            </div>
          </div>
          <div className="lx-dash-strip">
            <span>📄 <b>Already written some of it?</b> Upload your manuscript PDF</span>
            <span className="lx-chip-btn">Upload PDF</span>
          </div>
          <div className="lx-dash-grid">
            {CHAPTERS.map((c, i) => (
              <motion.div
                key={c.n} className="lx-cc" style={{ background: GRADIENTS[i] }}
                initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ delay: 0.25 + i * 0.07, duration: 0.5 }}
              >
                <Badge kind={c.kind} />
                <div className="lx-cc-num">{c.n}</div>
                {c.excerpt && <div className="lx-cc-ex">{c.excerpt}</div>}
                <div className="lx-cc-foot">
                  <div className="lx-cc-title">{c.title}</div>
                  <div className="lx-cc-meta">{c.recs} recording{c.recs !== 1 ? "s" : ""}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </Window>
  );
}

// ── Chapter popup: record / upload / PDF / type / add more ──────────────────
export function ChapterMock({ compact = false }: { compact?: boolean }) {
  return (
    <div className="lx-modal">
      <div className="lx-modal-head" style={{ background: GRADIENTS[3] }}>
        <div className="lx-modal-num">04</div>
        <div>
          <div className="lx-modal-title">Elias</div>
          <Badge kind="recording" />
        </div>
      </div>
      <div className="lx-modal-body">
        <div className="lx-part">
          <div className="lx-part-head"><b>Part 1</b><span>🎙 3 recordings</span></div>
          <div className="lx-part-row">
            <span className="lx-btn-rec"><span className="lx-rec-dot" /> Stop · <RecClock /></span>
            <span className="lx-btn-ghost">⬆ Upload audio</span>
            <span className="lx-btn-ghost">📄 Replace PDF</span>
          </div>
          <Waveform className="lx-part-wave" bars={48} height={34} />
          <div className="lx-pdf-row">📄 <b>elias-first-draft.pdf</b> · 4 pages · 1,180 words</div>
          {!compact && (
            <div className="lx-textbox">
              <Typewriter text="He arrived the morning after the storm, carrying nothing but a brass key and my father's name…" />
            </div>
          )}
        </div>
        <div className="lx-part lx-part-dim">
          <div className="lx-part-head"><b>Part 2</b><span>📄 harbour-notes.pdf · ✍ written text</span></div>
        </div>
        <div className="lx-add-more">＋ Add more</div>
      </div>
    </div>
  );
}

function RecClock() {
  const reduce = useReducedMotion();
  return (
    <motion.span
      className="lx-tnum"
      initial={{ opacity: 1 }}
      animate={reduce ? undefined : { opacity: [1, 0.55, 1] }}
      transition={{ repeat: Infinity, duration: 1.2 }}
    >
      12:48
    </motion.span>
  );
}

// ── Reader ───────────────────────────────────────────────────────────────────
export function ReaderMock() {
  return (
    <Window title="inkwell.app / Chapter 3 — The Storm" className="lx-window-light">
      <div className="lx-reader-bar">
        <span className="lx-reader-kicker">Manuscript</span>
        <span className="lx-reader-actions">
          <span>✏ Edit</span><span className="amber">↓ PDF</span><span className="blue">🤖 Share to AI</span><span className="violet">▶ Listen</span>
        </span>
      </div>
      <div className="lx-reader">
        <h4>Chapter 3: The Storm</h4>
        <div className="lx-reader-rule" />
        <p><span className="lx-drop">T</span>he wind came in off the Atlantic like something with a grudge. By nightfall the island had gone quiet in the way only islands can — every door bolted, every boat dragged high above the tide line — and Maya sat alone in the lamp room with the letter she had not yet dared to open.</p>
        <p>Her father had taught her to trim the wick when she was six. <em>Light is a promise,</em> he'd said. <em>You keep it even when no one is watching.</em></p>
        <div className="lx-listen">
          <span className="lx-listen-play">▶</span>
          <div className="lx-listen-track"><motion.div className="lx-listen-fill" initial={{ width: "8%" }} whileInView={{ width: "64%" }} transition={{ duration: 6, ease: "linear" }} viewport={{ once: true }} /></div>
          <span className="lx-listen-t">04:12</span>
        </div>
      </div>
    </Window>
  );
}

// ── CMS (editors) ────────────────────────────────────────────────────────────
export function CmsMock() {
  const rows = [
    { n: "01", t: "The Light on Carrow Point", state: "pub" },
    { n: "02", t: "A Letter for My Father", state: "pub" },
    { n: "03", t: "The Storm", state: "writing" },
    { n: "04", t: "Elias", state: "ready" },
  ];
  return (
    <Window title="inkwell.app/cms — Maya R. · The Lighthouse Keeper">
      <div className="lx-cms">
        {rows.map((r, i) => (
          <motion.div key={r.n} className="lx-cms-row" style={{ background: GRADIENTS[i] }}
            initial={{ opacity: 0, x: -12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}>
            <span className="lx-cms-n">{r.n}</span>
            <span className="lx-cms-t">{r.t}</span>
            {r.state === "pub" && <span className="lx-cms-pub">✓ Published · Nov 12</span>}
            {r.state === "writing" && <span className="lx-cms-writing"><span className="lx-spin" /> Writing… part 2 of 3</span>}
            {r.state === "ready" && <span className="lx-cms-write">✦ Write Chapter</span>}
            {r.state === "pub" && <span className="lx-cms-send">📧 Send</span>}
          </motion.div>
        ))}
      </div>
    </Window>
  );
}

// ── Share to AI ──────────────────────────────────────────────────────────────
export function ShareMock() {
  return (
    <div className="lx-share">
      <div className="lx-share-title">Share to AI</div>
      <div className="lx-share-sub">Chapter 3: The Storm · The Lighthouse Keeper</div>
      <div className="lx-share-primary">📤 Share PDF to an app…</div>
      <div className="lx-share-label">Or open in</div>
      <div className="lx-share-row"><span>ChatGPT</span><span>Claude</span><span>Gemini</span></div>
      <div className="lx-share-note">Opens with the whole chapter already in the message box.</div>
    </div>
  );
}

// ── Chapter memory: summaries flow forward (SVG) ─────────────────────────────
export function ContextFlow() {
  const reduce = useReducedMotion();
  const nodes = [{ x: 60, label: "Ch 1" }, { x: 200, label: "Ch 2" }, { x: 340, label: "Ch 3" }];
  const path = "M 92 60 C 130 20, 150 20, 168 60 M 232 60 C 270 20, 290 20, 308 60";
  return (
    <svg className="lx-flow" viewBox="0 0 400 120" aria-hidden>
      <defs>
        <linearGradient id="lxEmber" x1="0" x2="1">
          <stop offset="0%" stopColor="#FF8A3D" /><stop offset="55%" stopColor="#FF3D81" /><stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <motion.path d={path} fill="none" stroke="url(#lxEmber)" strokeWidth="2" strokeLinecap="round"
        initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.4 }} />
      {!reduce && [0, 1].map((k) => (
        <motion.circle key={k} r="4" fill="#FFB86B"
          style={{ offsetPath: `path("${k === 0 ? "M 92 60 C 130 20, 150 20, 168 60" : "M 232 60 C 270 20, 290 20, 308 60"}")` }}
          animate={{ offsetDistance: ["0%", "100%"], opacity: [0, 1, 1, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, delay: k * 1.1, ease: "easeInOut" }} />
      ))}
      {nodes.map((n, i) => (
        <g key={n.label}>
          <rect x={n.x - 32} y={42} width={64} height={36} rx={10} fill="#151525" stroke={i === 2 ? "url(#lxEmber)" : "rgba(255,255,255,0.14)"} strokeWidth={i === 2 ? 1.6 : 1} />
          <text x={n.x} y={65} textAnchor="middle" fill="#EBEBF7" fontSize="13" fontWeight="600">{n.label}</text>
        </g>
      ))}
      <text x="130" y="104" textAnchor="middle" fill="#8b8bb0" fontSize="10.5">summary</text>
      <text x="270" y="104" textAnchor="middle" fill="#8b8bb0" fontSize="10.5">summary</text>
    </svg>
  );
}
