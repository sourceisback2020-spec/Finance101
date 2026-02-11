import { useMemo, useState } from "react";

type Props = {
  error: string | null;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
};

export function AuthView({ error, onSignIn, onSignUp }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState<null | "signin" | "signup">(null);
  const [status, setStatus] = useState<string | null>(null);

  const formValid = useMemo(() => email.trim().length > 0 && password.length >= 6, [email, password]);

  const handleSignIn = async () => {
    setLoading("signin");
    setStatus(null);
    try {
      await onSignIn(email.trim(), password);
    } finally {
      setLoading(null);
    }
  };

  const handleSignUp = async () => {
    setLoading("signup");
    setStatus(null);
    try {
      await onSignUp(email.trim(), password);
      setStatus("Account created. If email confirmation is enabled, verify your email, then sign in.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="auth-shell">
      <section className="auth-card">
        <h1>Secure Sign In</h1>
        <p className="muted">Hosted mode now requires your Supabase account before data can load.</p>
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
          />
        </label>
        <div className="row-actions">
          <button type="button" disabled={!formValid || loading !== null} onClick={() => void handleSignIn()}>
            {loading === "signin" ? "Signing In..." : "Sign In"}
          </button>
          <button className="secondary-btn" type="button" disabled={!formValid || loading !== null} onClick={() => void handleSignUp()}>
            {loading === "signup" ? "Creating..." : "Create Account"}
          </button>
        </div>
        {status ? <p className="muted">{status}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}
      </section>
    </div>
  );
}

