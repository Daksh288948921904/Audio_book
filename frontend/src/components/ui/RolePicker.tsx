import { useEffect } from "react";
import { motion, useReducedMotion } from "motion/react";
import { BorderTrail, TextEffect, Tilt } from "../landing/primitives";

/** "Where to?" — admins choose between the editor studio (CMS) and their own books. */
export default function RolePicker({ name, onAdmin, onUser, overlay = false }: {
  name: string;
  onAdmin: () => void;
  onUser: () => void;
  overlay?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "1" || e.key.toLowerCase() === "a") onAdmin();
      if (e.key === "2" || e.key.toLowerCase() === "u") onUser();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onAdmin, onUser]);

  const first = (name || "").trim().split(/\s+/)[0] || "there";
  return (
    <div className={`ux-role ${overlay ? "ux-role-overlay" : ""}`}>
      <div className="ux-role-aurora" aria-hidden><span /><span /><span /></div>
      <div className="ux-role-inner">
        <motion.div className="ux-mark" initial={{ scale: 0.6, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}>I</motion.div>
        <h1 className="ux-role-h">
          <TextEffect>Where to,</TextEffect>{" "}
          <motion.em className="ux-ember-text" initial={{ opacity: 0, filter: "blur(8px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} transition={{ delay: 0.3, duration: 0.6 }}>{first}?</motion.em>
        </h1>
        <motion.p className="ux-role-sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
          You have editor access. Pick a workspace — press <kbd className="ux-kbd">1</kbd> or <kbd className="ux-kbd">2</kbd>.
        </motion.p>
        <div className="ux-role-grid">
          <RoleCard delay={0.55} k="1" title="Editor Studio" body="Review every author's chapters, write and compile books, publish to authors."
            art={<StudioArt />} onClick={onAdmin} primary />
          <RoleCard delay={0.65} k="2" title="My Books" body="Record, upload and write your own book — the author dashboard."
            art={<AuthorArt />} onClick={onUser} />
        </div>
      </div>
    </div>
  );
}

function RoleCard({ title, body, art, onClick, k, delay, primary }: {
  title: string; body: string; art: React.ReactNode; onClick: () => void; k: string; delay: number; primary?: boolean;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 24, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ delay, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
      <Tilt max={6}>
        <button className={`ux-role-card ${primary ? "primary" : ""}`} onClick={onClick}>
          {primary && <BorderTrail duration={6} />}
          <div className="ux-role-art">{art}</div>
          <div className="ux-role-card-text">
            <div className="ux-role-card-title">{title} <span className="ux-role-go">→</span></div>
            <div className="ux-role-card-body">{body}</div>
          </div>
          <kbd className="ux-kbd ux-role-key">{k}</kbd>
        </button>
      </Tilt>
    </motion.div>
  );
}

/** Editor console: chapter rows getting checked off one after another. */
function StudioArt() {
  const reduce = useReducedMotion();
  const rows = [0, 1, 2, 3];
  return (
    <svg viewBox="0 0 220 120" aria-hidden>
      <defs>
        <linearGradient id="uxEmber" x1="0" x2="1"><stop offset="0" stopColor="#FF8A3D" /><stop offset=".55" stopColor="#FF3D81" /><stop offset="1" stopColor="#8B5CF6" /></linearGradient>
      </defs>
      <rect x="6" y="6" width="208" height="108" rx="14" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.10)" />
      {rows.map((r) => (
        <g key={r} transform={`translate(20 ${20 + r * 23})`}>
          <rect width="180" height="16" rx="5" fill="rgba(255,255,255,0.05)" />
          <motion.rect height="16" rx="5" fill="url(#uxEmber)" opacity="0.35"
            initial={{ width: 0 }} animate={{ width: reduce ? 150 : [0, 150, 150] }}
            transition={{ duration: 3.2, delay: r * 0.5, repeat: reduce ? 0 : Infinity, repeatDelay: 1.2, times: [0, 0.5, 1] }} />
          <rect x="8" y="5" width={60 + (r % 2) * 30} height="6" rx="3" fill="rgba(255,255,255,0.55)" />
          <motion.circle cx="168" cy="8" r="6" fill="#34D399"
            initial={{ scale: 0 }} animate={{ scale: reduce ? 1 : [0, 0, 1, 1] }}
            transition={{ duration: 3.2, delay: r * 0.5, repeat: reduce ? 0 : Infinity, repeatDelay: 1.2, times: [0, 0.48, 0.58, 1] }} />
        </g>
      ))}
    </svg>
  );
}

/** Author: a mic whose sound waves become lines on a page. */
function AuthorArt() {
  const reduce = useReducedMotion();
  return (
    <svg viewBox="0 0 220 120" aria-hidden>
      <defs>
        <linearGradient id="uxEmber2" x1="0" x2="1"><stop offset="0" stopColor="#FF8A3D" /><stop offset=".55" stopColor="#FF3D81" /><stop offset="1" stopColor="#8B5CF6" /></linearGradient>
      </defs>
      <g transform="translate(26 30)">
        <rect x="10" y="0" width="22" height="38" rx="11" fill="url(#uxEmber2)" />
        <path d="M2 26a19 19 0 0 0 38 0M21 45v10M11 56h20" stroke="rgba(255,255,255,0.6)" strokeWidth="3" strokeLinecap="round" fill="none" />
      </g>
      {Array.from({ length: 9 }, (_, i) => {
        const h = 8 + 26 * Math.abs(Math.sin(i * 0.9));
        return (
          <motion.rect key={i} x={84 + i * 6} width="3.4" rx="1.7" fill="url(#uxEmber2)"
            initial={{ height: h, y: 58 - h / 2 }}
            animate={reduce ? undefined : { height: [h * 0.4, h, h * 0.6, h * 0.4], y: [58 - h * 0.2, 58 - h / 2, 58 - h * 0.3, 58 - h * 0.2] }}
            transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.07 }} />
        );
      })}
      <rect x="146" y="18" width="62" height="82" rx="8" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.14)" />
      {[0, 1, 2, 3, 4, 5].map((l) => (
        <motion.rect key={l} x="154" y={30 + l * 11} height="4" rx="2" fill="rgba(255,255,255,0.6)"
          initial={{ width: 0 }} animate={{ width: reduce ? (l === 5 ? 26 : 46) : [0, l === 5 ? 26 : 46, l === 5 ? 26 : 46] }}
          transition={{ duration: 3, delay: 0.3 + l * 0.25, repeat: reduce ? 0 : Infinity, repeatDelay: 1, times: [0, 0.4, 1] }} />
      ))}
    </svg>
  );
}
