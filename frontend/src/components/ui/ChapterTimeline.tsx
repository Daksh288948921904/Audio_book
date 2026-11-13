import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Chapter } from "../../api/client";

/** The book as a journey: one node per chapter, coloured by status, with the
 *  finished share drawn as an ember line. Click a node to open that chapter. */
export default function ChapterTimeline({ chapters, labelFor, onOpen }: {
  chapters: Chapter[];
  labelFor: (c: Chapter) => string;
  onOpen: (c: Chapter) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (chapters.length < 2) return null;
  const done = chapters.filter((c) => c.status === "done").length;
  // Progress line reaches the last finished chapter in order
  let reach = -1;
  chapters.forEach((c, i) => { if (c.status === "done") reach = i; });
  const pct = chapters.length > 1 ? Math.max(0, reach) / (chapters.length - 1) : 0;

  return (
    <div className="ux-tl">
      <div className="ux-tl-head">
        <span className="ux-tl-title">Your book's journey</span>
        <span className="ux-tl-meta">{done} of {chapters.length} chapters written</span>
      </div>
      <div className="ux-tl-scroll">
        <div className="ux-tl-track" style={{ minWidth: Math.max(chapters.length * 46, 100) }}>
          <div className="ux-tl-rail" />
          <motion.div className="ux-tl-fill" initial={{ scaleX: 0 }} animate={{ scaleX: reach >= 0 ? pct : 0 }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }} />
          {chapters.map((c, i) => (
            <motion.button
              key={c.id}
              className={`ux-tl-node ux-tl-${c.status}`}
              style={{ left: `${chapters.length > 1 ? (i / (chapters.length - 1)) * 100 : 50}%` }}
              initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15 + i * 0.04, type: "spring", stiffness: 420, damping: 22 }}
              whileHover={{ scale: 1.25 }} whileTap={{ scale: 0.92 }}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
              onClick={() => onOpen(c)}
              aria-label={`${labelFor(c)} — ${c.status === "done" ? "written" : c.status === "generating" ? "being written" : "recording"}`}
            >
              {c.status === "done" && (
                <svg viewBox="0 0 16 16" aria-hidden><path d="M4 8.5l2.5 2.5L12 5.5" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              )}
              <AnimatePresence>
                {hover === i && (
                  <motion.span className="ux-tl-tip" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.15 }}>
                    <b>{labelFor(c)}</b>
                    <span>{c.status === "done" ? "Written ✓" : c.status === "generating" ? "Being written…" : "Recording"}</span>
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
