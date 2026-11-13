import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

export interface Command {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: string;
  keywords?: string;
  run: () => void;
}

/** Subsequence match ("nwbk" finds "New book"); lower score = better. */
function score(q: string, text: string): number | null {
  if (!q) return 0;
  const t = text.toLowerCase();
  const direct = t.indexOf(q);
  if (direct >= 0) return direct;
  let pos = -1, gaps = 0;
  for (const ch of q) {
    const next = t.indexOf(ch, pos + 1);
    if (next < 0) return null;
    gaps += next - pos - 1;
    pos = next;
  }
  return 100 + gaps;
}

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** ⌘K palette: type to filter, ↑↓ to move, ↵ to run, esc to close. */
export default function CommandPalette({ open, onClose, commands, placeholder = "Type a command or search…" }: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) { setQ(""); setActive(0); setTimeout(() => inputRef.current?.focus(), 10); } }, [open]);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    const scored = commands
      .map((c) => ({ c, s: score(query, `${c.label} ${c.keywords ?? ""} ${c.group}`) }))
      .filter((x) => x.s !== null);
    // Direct substring matches win; loose subsequence matches only if there are none.
    const direct = scored.filter((x) => x.s! < 100);
    return (direct.length ? direct : scored).sort((a, b) => (a.s! - b.s!)).map((x) => x.c);
  }, [q, commands]);

  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function run(c: Command | undefined) {
    if (!c) return;
    onClose();
    setTimeout(c.run, 60);  // let the palette close before the action opens anything
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); run(results[active]); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  }

  // Group while keeping the sorted order
  const groups: { name: string; items: { c: Command; idx: number }[] }[] = [];
  results.forEach((c, idx) => {
    let g = groups.find((x) => x.name === c.group);
    if (!g) groups.push(g = { name: c.group, items: [] });
    g.items.push({ c, idx });
  });

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="ux-cmdk-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          <motion.div className="ux-cmdk" role="dialog" aria-label="Command palette"
            initial={{ opacity: 0, y: -14, scale: 0.97, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8, scale: 0.98, filter: "blur(4px)" }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
            <div className="ux-cmdk-input-row">
              <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden>
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" /><path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input ref={inputRef} className="ux-cmdk-input" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder={placeholder} />
              <kbd className="ux-kbd">esc</kbd>
            </div>
            <div className="ux-cmdk-list" ref={listRef}>
              {results.length === 0 && <div className="ux-cmdk-empty">Nothing matches “{q}”.</div>}
              {groups.map((g) => (
                <div key={g.name} className="ux-cmdk-group">
                  <div className="ux-cmdk-group-label">{g.name}</div>
                  {g.items.map(({ c, idx }) => (
                    <button key={c.id} data-idx={idx} className={`ux-cmdk-item ${idx === active ? "active" : ""}`}
                      onMouseMove={() => setActive(idx)} onClick={() => run(c)}>
                      {idx === active && <motion.span layoutId="ux-cmdk-hl" className="ux-cmdk-hl" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                      <span className="ux-cmdk-icon">{c.icon}</span>
                      <span className="ux-cmdk-label">{c.label}</span>
                      {c.hint && <span className="ux-cmdk-hint">{c.hint}</span>}
                      {idx === active && <span className="ux-cmdk-enter">↵</span>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <div className="ux-cmdk-foot">
              <span><kbd className="ux-kbd">↑</kbd><kbd className="ux-kbd">↓</kbd> navigate</span>
              <span><kbd className="ux-kbd">↵</kbd> run</span>
              <span><kbd className="ux-kbd">{isMac ? "⌘" : "Ctrl"}</kbd><kbd className="ux-kbd">K</kbd> toggle</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
