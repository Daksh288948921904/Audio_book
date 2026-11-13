import type { ReactNode } from "react";
import { motion } from "motion/react";

/** Circular progress in the ember gradient; draws itself in on mount and on change. */
export default function ProgressRing({ value, size = 76, stroke = 7, children }: {
  value: number;        // 0 … 1
  size?: number;
  stroke?: number;
  children?: ReactNode; // centre content
}) {
  const r = (size - stroke) / 2;
  const id = `ring-${size}-${stroke}`;
  return (
    <div className="ux-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FF8A3D" /><stop offset="55%" stopColor="#FF3D81" /><stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${id})`} strokeWidth={stroke} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: Math.max(0.001, Math.min(1, value)) }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="ux-ring-center">{children}</div>
    </div>
  );
}
