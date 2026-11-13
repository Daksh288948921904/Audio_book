// Small animation building blocks for the landing page, in the style of
// Motion Primitives (motion-primitives.com) but without Tailwind.
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  animate, motion, useInView, useMotionTemplate, useMotionValue, useReducedMotion,
  useSpring, useTransform, type Variants,
} from "motion/react";

/** Words blur and rise into place, one after another. */
export function TextEffect({ children, className, delay = 0, as = "span" }: {
  children: string; className?: string; delay?: number; as?: "span" | "h1" | "h2" | "p";
}) {
  const Tag = motion[as];
  const words = children.split(" ");
  const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.045, delayChildren: delay } } };
  const word: Variants = {
    hidden: { opacity: 0, y: 14, filter: "blur(8px)" },
    show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
  };
  return (
    <Tag className={className} variants={container} initial="hidden" whileInView="show" viewport={{ once: true }}>
      {words.map((w, i) => (
        <motion.span key={i} variants={word} style={{ display: "inline-block", whiteSpace: "pre" }}>
          {w}{i < words.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </Tag>
  );
}

/** Fades and lifts its children in when scrolled into view. */
export function InView({ children, className, delay = 0, y = 28 }: {
  children: ReactNode; className?: string; delay?: number; y?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Counts up to `value` the first time it scrolls into view. */
export function AnimatedNumber({ value, decimals = 0, prefix = "", suffix = "" }: {
  value: number; decimals?: number; prefix?: string; suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const spring = useSpring(0, { stiffness: 60, damping: 20 });
  const text = useTransform(spring, (v) => `${prefix}${v.toFixed(decimals)}${suffix}`);
  useEffect(() => { if (inView) spring.set(value); }, [inView, spring, value]);
  return <motion.span ref={ref}>{text}</motion.span>;
}

/** A bright streak of light that travels around its parent's border.
 *  Parent needs position: relative and a border-radius. */
export function BorderTrail({ duration = 6 }: { duration?: number }) {
  const reduce = useReducedMotion();
  return (
    <div className="lx-trail-mask" aria-hidden>
      <motion.div
        className="lx-trail-spin"
        animate={reduce ? undefined : { rotate: 360 }}
        transition={{ repeat: Infinity, duration, ease: "linear" }}
      />
    </div>
  );
}

/** A soft light that follows the pointer inside its parent. */
export function Spotlight({ size = 520, className }: { size?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(-size);
  const y = useMotionValue(-size);
  const sx = useSpring(x, { stiffness: 120, damping: 20 });
  const sy = useSpring(y, { stiffness: 120, damping: 20 });
  const bg = useMotionTemplate`radial-gradient(${size / 2}px circle at ${sx}px ${sy}px, rgba(255,110,80,0.16), transparent 70%)`;
  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const move = (e: PointerEvent) => {
      const r = parent.getBoundingClientRect();
      x.set(e.clientX - r.left); y.set(e.clientY - r.top);
    };
    parent.addEventListener("pointermove", move);
    return () => parent.removeEventListener("pointermove", move);
  }, [x, y]);
  return <motion.div ref={ref} className={`lx-spotlight ${className ?? ""}`} style={{ background: bg }} aria-hidden />;
}

/** Tilts its content toward the pointer in 3D. */
export function Tilt({ children, className, max = 8 }: { children: ReactNode; className?: string; max?: number }) {
  const reduce = useReducedMotion();
  const rx = useSpring(0, { stiffness: 150, damping: 18 });
  const ry = useSpring(0, { stiffness: 150, damping: 18 });
  return (
    <motion.div
      className={className}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 1400 }}
      onPointerMove={(e) => {
        if (reduce) return;
        const r = e.currentTarget.getBoundingClientRect();
        ry.set(((e.clientX - r.left) / r.width - 0.5) * max * 2);
        rx.set(-((e.clientY - r.top) / r.height - 0.5) * max * 2);
      }}
      onPointerLeave={() => { rx.set(0); ry.set(0); }}
    >
      {children}
    </motion.div>
  );
}

/** Endless horizontal marquee. */
export function InfiniteSlider({ children, duration = 40 }: { children: ReactNode; duration?: number }) {
  const reduce = useReducedMotion();
  return (
    <div className="lx-marquee">
      <motion.div
        className="lx-marquee-track"
        animate={reduce ? undefined : { x: ["0%", "-50%"] }}
        transition={{ repeat: Infinity, duration, ease: "linear" }}
      >
        {children}{children}
      </motion.div>
    </div>
  );
}

/** Types `text` out once it's in view, then holds. */
export function Typewriter({ text, speed = 28, className }: { text: string; speed?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [shown, setShown] = useState("");
  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, text.length, {
      duration: text.length / speed, ease: "linear",
      onUpdate: (v) => setShown(text.slice(0, Math.round(v))),
    });
    return () => controls.stop();
  }, [inView, text, speed]);
  return <span ref={ref} className={className}>{shown}<span className="lx-caret" /></span>;
}

/** Live-looking audio waveform made of SVG bars. */
export function Waveform({ bars = 36, height = 40, active = true, className }: {
  bars?: number; height?: number; active?: boolean; className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <svg className={className} viewBox={`0 0 ${bars * 6} ${height}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="lxWave" x1="0" x2="1">
          <stop offset="0%" stopColor="#FF8A3D" /><stop offset="55%" stopColor="#FF3D81" /><stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      {Array.from({ length: bars }, (_, i) => {
        const base = 0.25 + 0.75 * Math.abs(Math.sin(i * 0.55) * Math.cos(i * 0.21));
        const h = base * height;
        return (
          <motion.rect
            key={i} x={i * 6 + 1} width={3.4} rx={1.7} fill="url(#lxWave)"
            initial={{ height: h, y: (height - h) / 2 }}
            animate={active && !reduce ? {
              height: [h * 0.35, h, h * 0.55, h * 0.9, h * 0.35],
              y: [(height - h * 0.35) / 2, (height - h) / 2, (height - h * 0.55) / 2, (height - h * 0.9) / 2, (height - h * 0.35) / 2],
            } : undefined}
            transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.04, ease: "easeInOut" }}
          />
        );
      })}
    </svg>
  );
}
