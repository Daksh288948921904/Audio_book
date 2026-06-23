import { useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { loginWithGoogle, setAuthToken } from "../api/client";

interface Props {
  onLogin: (user: { email: string; name: string }) => void;
}

export default function LoginScreen({ onLogin }: Props) {
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleSuccess(credentialResponse: { credential?: string }) {
    if (!credentialResponse.credential) { setError("No credential received."); return; }
    setError(null);
    try {
      const data = await loginWithGoogle(credentialResponse.credential);
      setAuthToken(data.token);
      onLogin({ email: data.email, name: data.name });
    } catch {
      setError("Sign-in failed. Please try again.");
    }
  }

  return (
    <div className="ls">
      {/* Animated background orbs */}
      <div className="ls-orb ls-orb-1" />
      <div className="ls-orb ls-orb-2" />
      <div className="ls-orb ls-orb-3" />
      <div className="ls-grid" />

      {/* Left — hero */}
      <div className="ls-left">
        <div className="ls-eyebrow">
          <span className="ls-dot" />
          Your Private Writing Studio
        </div>

        <h1 className="ls-title">
          Turn your<br />
          <span className="ls-title-accent">voice</span><br />
          into a book.
        </h1>

        <p className="ls-sub">
          Record your ideas. Assign them to chapters.<br />
          Watch them become polished prose — in your style.
        </p>

        <div className="ls-features">
          {[
            ["✦", "Instant voice-to-text — speak naturally"],
            ["✦", "Tone-aware writing for every recording"],
            ["✦", "Beautifully crafted chapters, automatically"],
            ["✦", "Private workspace — only you see your books"],
            ["✦", "Export any chapter as a PDF"],
          ].map(([icon, text], i) => (
            <div key={i} className="ls-feat" style={{ animationDelay: `${0.6 + i * 0.1}s` }}>
              <span className="ls-feat-icon">{icon}</span>
              {text}
            </div>
          ))}
        </div>

        <div className="ls-quote">
          "The first draft of anything is just<br />talking to yourself."
          <div className="ls-quote-attr">— adapted from Hemingway</div>
        </div>
      </div>

      {/* Right — sign-in card */}
      <div className="ls-right">
        <div className="ls-card">
          <div className="ls-card-logo">
            <div className="logo-mark" style={{ width: 52, height: 52, fontSize: 24 }}>I</div>
          </div>

          <div className="ls-card-title">Welcome to Inkwell</div>
          <div className="ls-card-sub">Sign in to access your private workspace</div>

          <div className="ls-divider" />

          {error && <div className="login-error">{error}</div>}

          <div className="ls-google-wrap">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => setError("Google sign-in failed.")}
              theme="filled_black"
              shape="rectangular"
              size="large"
              text="continue_with"
              width="280"
            />
          </div>

          <div className="ls-terms">
            By signing in you agree to keep your recordings<br />
            tasteful. Your data is yours — always.
          </div>

          <div className="ls-card-badges">
            <div className="ls-badge">🔒 Private</div>
            <div className="ls-badge">☁ Cloud sync</div>
            <div className="ls-badge">✦ Voice-powered</div>
          </div>
        </div>

        {/* Floating decorative words */}
        <div className="ls-float ls-float-1">Chapter I</div>
        <div className="ls-float ls-float-2">Prologue</div>
        <div className="ls-float ls-float-3">Epilogue</div>
      </div>
    </div>
  );
}
