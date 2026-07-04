import { useEffect, useState } from "react";

interface Props {
  name: string;
  hasBooks: boolean;
  onDone: () => void;
}

export default function WelcomeScreen({ name, hasBooks, onDone }: Props) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 700);   // name appears
    const t2 = setTimeout(() => setPhase(2), 1500);  // subtitle appears
    const t3 = setTimeout(() => setPhase(3), 2800);  // books hint appears
    const t4 = setTimeout(() => setPhase(4), 3800);  // fade out begins
    const t5 = setTimeout(() => onDone(), 4600);     // unmount
    return () => [t1, t2, t3, t4, t5].forEach(clearTimeout);
  }, []);

  const firstName = name.split(" ")[0];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "radial-gradient(ellipse at 40% 40%, #1a0d2e 0%, #0a0a14 60%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      opacity: phase >= 4 ? 0 : 1,
      transition: "opacity 0.8s ease",
      userSelect: "none",
    }}>

      {/* Ambient glow */}
      <div style={{
        position: "absolute", top: "25%", left: "50%", transform: "translateX(-50%)",
        width: 600, height: 300, borderRadius: "50%",
        background: "radial-gradient(ellipse, rgba(109,40,217,0.18) 0%, transparent 70%)",
        pointerEvents: "none",
        opacity: phase >= 1 ? 1 : 0,
        transition: "opacity 1.2s ease",
      }} />

      {/* Logo mark */}
      <div style={{
        width: 72, height: 72, borderRadius: 20,
        background: "linear-gradient(135deg,#6d28d9,#8b5cf6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 32, fontWeight: 900, color: "#fff",
        marginBottom: 40,
        boxShadow: "0 0 40px rgba(139,92,246,0.4)",
        opacity: 1,
        transform: "scale(1)",
        animation: "welcomeLogoIn 0.7s cubic-bezier(0.34,1.56,0.64,1) forwards",
      }}>I</div>

      {/* "Welcome," */}
      <div style={{
        fontSize: "clamp(28px, 5vw, 52px)",
        fontWeight: 800,
        color: "#e4e4f0",
        letterSpacing: "-1px",
        lineHeight: 1.1,
        animation: "welcomeFadeUp 0.6s ease forwards",
        marginBottom: 4,
      }}>
        Welcome,
      </div>

      {/* Name — purple gradient */}
      <div style={{
        fontSize: "clamp(32px, 6vw, 60px)",
        fontWeight: 900,
        letterSpacing: "-1.5px",
        lineHeight: 1.1,
        background: "linear-gradient(135deg,#a78bfa,#c084fc,#e879f9)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        marginBottom: 32,
        opacity: phase >= 1 ? 1 : 0,
        transform: phase >= 1 ? "translateY(0px)" : "translateY(20px)",
        transition: "opacity 0.7s ease, transform 0.7s cubic-bezier(0.34,1.2,0.64,1)",
      }}>
        {firstName}
      </div>

      {/* Subtitle */}
      <div style={{
        fontSize: "clamp(14px, 2vw, 18px)",
        color: "#9898b8",
        fontWeight: 400,
        letterSpacing: "0.2px",
        marginBottom: 48,
        opacity: phase >= 2 ? 1 : 0,
        transform: phase >= 2 ? "translateY(0px)" : "translateY(14px)",
        transition: "opacity 0.6s ease, transform 0.6s ease",
      }}>
        Let's get your book published.
      </div>

      {/* Books hint — different for new vs returning users */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        opacity: phase >= 3 ? 1 : 0,
        transform: phase >= 3 ? "translateY(0px)" : "translateY(10px)",
        transition: "opacity 0.6s ease, transform 0.6s ease",
      }}>
        <div style={{
          width: 32, height: 2,
          background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.6))",
          borderRadius: 1,
        }} />
        <span style={{ fontSize: 13, color: "#6060a0", letterSpacing: "0.5px" }}>
          {hasBooks ? "Loading your books…" : "Ready to create your first chapter"}
        </span>
        <div style={{
          width: 32, height: 2,
          background: "linear-gradient(90deg, rgba(139,92,246,0.6), transparent)",
          borderRadius: 1,
        }} />
      </div>

      {/* Inline keyframes */}
      <style>{`
        @keyframes welcomeLogoIn {
          from { opacity: 0; transform: scale(0.6) translateY(10px); }
          to   { opacity: 1; transform: scale(1)   translateY(0);    }
        }
        @keyframes welcomeFadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
      `}</style>
    </div>
  );
}
