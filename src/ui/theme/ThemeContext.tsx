import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type FontFamilyMode = "sans" | "serif" | "mono";
type DensityMode = "cozy" | "comfortable" | "compact";
type TextureMode = "none" | "grain" | "scanlines" | "carbon" | "dots";
type StyleMode = "neon" | "soft" | "minimal" | "terminal";

type EffectSettings = {
  glassmorphism: boolean;
  noiseTexture: boolean;
  interactiveGlow: boolean;
  ambientMotion: boolean;
  mouseTrailer: boolean;
  scrollReveal: boolean;
  glitchHeaders: boolean;
};

export type AppearanceSettings = {
  primary: string;
  secondary: string;
  accent: string;
  fontFamily: FontFamilyMode;
  fontScale: number;
  lineHeight: number;
  radius: number;
  density: DensityMode;
  texture: TextureMode;
  style: StyleMode;
  effects: EffectSettings;
};

type SavedPreset = {
  id: string;
  name: string;
  settings: AppearanceSettings;
};

type AppearanceContextValue = {
  appearance: AppearanceSettings;
  setAppearance: (next: Partial<AppearanceSettings>) => void;
  setEffect: (key: keyof EffectSettings, value: boolean) => void;
  savedPresets: SavedPreset[];
  builtinPresets: SavedPreset[];
  applyPreset: (settings: AppearanceSettings) => void;
  savePreset: (name: string) => void;
  deletePreset: (id: string) => void;
  randomize: () => void;
};

const STORAGE_KEY = "appearance.engine.v1";
const PRESET_KEY = "appearance.engine.presets.v1";

const defaultAppearance: AppearanceSettings = {
  primary: "#0b1638",
  secondary: "#16235a",
  accent: "#ffe100",
  fontFamily: "sans",
  fontScale: 1,
  lineHeight: 1.45,
  radius: 16,
  density: "comfortable",
  texture: "grain",
  style: "neon",
  effects: {
    glassmorphism: true,
    noiseTexture: true,
    interactiveGlow: true,
    ambientMotion: false,
    mouseTrailer: false,
    scrollReveal: false,
    glitchHeaders: false
  }
};

const builtinPresets: SavedPreset[] = [
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    settings: {
      ...defaultAppearance,
      primary: "#060b1f",
      secondary: "#121f47",
      accent: "#ffe100",
      fontFamily: "sans",
      radius: 14,
      style: "neon",
      texture: "scanlines",
      effects: { ...defaultAppearance.effects, glitchHeaders: true }
    }
  },
  {
    id: "vaporwave",
    name: "Vaporwave",
    settings: {
      ...defaultAppearance,
      primary: "#130722",
      secondary: "#2b1150",
      accent: "#ff2ea6",
      fontFamily: "serif",
      radius: 20,
      style: "soft",
      texture: "dots",
      effects: { ...defaultAppearance.effects, mouseTrailer: true }
    }
  },
  {
    id: "minimalist",
    name: "Minimalist",
    settings: {
      ...defaultAppearance,
      primary: "#050505",
      secondary: "#0d0d0d",
      accent: "#2dd4ff",
      fontFamily: "mono",
      radius: 4,
      style: "minimal",
      texture: "none",
      density: "compact",
      effects: {
        glassmorphism: false,
        noiseTexture: false,
        interactiveGlow: false,
        mouseTrailer: false,
        scrollReveal: false,
        glitchHeaders: false
      }
    }
  }
];

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  const normalized = clean.length === 3 ? clean.split("").map((x) => x + x).join("") : clean;
  const n = Number.parseInt(normalized, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function mix(hex: string, otherHex: string, ratio: number) {
  const a = hexToRgb(hex);
  const b = hexToRgb(otherHex);
  const t = clamp(ratio, 0, 1);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bVal = Math.round(a.b + (b.b - a.b) * t);
  return `rgb(${r}, ${g}, ${bVal})`;
}

function densityVars(density: DensityMode) {
  if (density === "compact") {
    return { contentPadding: "14px", panelPadding: "10px", gap: "12px" };
  }
  if (density === "cozy") {
    return { contentPadding: "28px", panelPadding: "20px", gap: "20px" };
  }
  return { contentPadding: "22px", panelPadding: "16px", gap: "16px" };
}

function applyAppearance(settings: AppearanceSettings) {
  const root = document.documentElement;
  const density = densityVars(settings.density);
  const fontFamily =
    settings.fontFamily === "serif"
      ? "\"IBM Plex Serif\", Georgia, Cambria, \"Times New Roman\", serif"
      : settings.fontFamily === "mono"
      ? "\"JetBrains Mono\", \"Fira Code\", Consolas, monospace"
      : "\"Inter\", \"Segoe UI\", system-ui, sans-serif";

  root.style.setProperty("--bg", "#000000");
  root.style.setProperty("--bg-soft", "#050505");
  root.style.setProperty("--bg-grad-a", settings.primary);
  root.style.setProperty("--bg-grad-b", settings.secondary);
  root.style.setProperty("--bg-grid", mix(settings.accent, "#000000", 0.84));
  root.style.setProperty("--panel", mix(settings.primary, "#000000", 0.28));
  root.style.setProperty("--panel-soft", mix(settings.secondary, "#000000", 0.18));
  root.style.setProperty("--sidebar", mix(settings.secondary, "#000000", 0.25));
  root.style.setProperty("--primary-surface", settings.primary);
  root.style.setProperty("--secondary-surface", settings.secondary);
  root.style.setProperty("--accent", settings.accent);
  root.style.setProperty("--accent-soft", mix(settings.accent, "#000000", 0.6));
  root.style.setProperty("--accent-bright", mix(settings.accent, "#ffffff", 0.2));
  root.style.setProperty("--text", "#ffffff");
  root.style.setProperty("--muted", mix("#ffffff", settings.secondary, 0.45));
  root.style.setProperty("--border", mix(settings.accent, "#111111", 0.75));
  root.style.setProperty("--radius-panel", `${Math.round(settings.radius)}px`);
  root.style.setProperty("--radius-control", `${Math.round(clamp(settings.radius - 4, 0, 999))}px`);
  root.style.setProperty("--content-padding", density.contentPadding);
  root.style.setProperty("--panel-padding", density.panelPadding);
  root.style.setProperty("--stack-gap", density.gap);
  root.style.setProperty("--font-family-ui", fontFamily);
  root.style.setProperty("--font-scale", settings.fontScale.toFixed(2));
  root.style.setProperty("--line-height-ui", settings.lineHeight.toFixed(2));
  root.setAttribute("data-glass", String(settings.effects.glassmorphism));
  root.setAttribute("data-noise", String(settings.effects.noiseTexture));
  root.setAttribute("data-glow", String(settings.effects.interactiveGlow));
  root.setAttribute("data-motion", String(settings.effects.ambientMotion));
  root.setAttribute("data-mouse-trail", String(settings.effects.mouseTrailer));
  root.setAttribute("data-scroll-reveal", String(settings.effects.scrollReveal));
  root.setAttribute("data-glitch", String(settings.effects.glitchHeaders));
  root.setAttribute("data-style", settings.style);
  root.setAttribute("data-texture", settings.texture);
}

function normalizeAppearance(raw?: Partial<AppearanceSettings>) {
  return {
    ...defaultAppearance,
    ...(raw ?? {}),
    effects: {
      ...defaultAppearance.effects,
      ...(raw?.effects ?? {})
    }
  };
}

function loadAppearance() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultAppearance;
    return normalizeAppearance(JSON.parse(raw) as Partial<AppearanceSettings>);
  } catch {
    return defaultAppearance;
  }
}

function loadPresets() {
  try {
    const raw = window.localStorage.getItem(PRESET_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedPreset[];
  } catch {
    return [];
  }
}

function randomHex() {
  const value = Math.floor(Math.random() * 0xffffff);
  return `#${value.toString(16).padStart(6, "0")}`;
}

function MouseTrail() {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    if (window.matchMedia("(pointer: coarse)").matches) {
      return;
    }

    let raf = 0;
    let active = true;
    let lastTime = 0;
    const target = { x: -1000, y: -1000 };
    const pos = { x: -1000, y: -1000 };
    const onMove = (event: MouseEvent) => {
      target.x = event.clientX;
      target.y = event.clientY;
    };
    const onVisibility = () => {
      active = document.visibilityState === "visible";
    };
    const tick = (time: number) => {
      if (!active) {
        raf = window.requestAnimationFrame(tick);
        return;
      }
      if (time - lastTime < 32) {
        raf = window.requestAnimationFrame(tick);
        return;
      }
      lastTime = time;
      pos.x += (target.x - pos.x) * 0.22;
      pos.y += (target.y - pos.y) * 0.22;
      if (ref.current) {
        ref.current.style.transform = `translate3d(${pos.x - 80}px, ${pos.y - 80}px, 0)`;
      }
      raf = window.requestAnimationFrame(tick);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    raf = window.requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("visibilitychange", onVisibility);
      window.cancelAnimationFrame(raf);
    };
  }, []);

  return <div ref={ref} className="mouse-trailer-layer" aria-hidden="true" />;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearanceState] = useState<AppearanceSettings>(() => loadAppearance());
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>(() => loadPresets());

  useEffect(() => {
    applyAppearance(appearance);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance));
  }, [appearance]);

  useEffect(() => {
    window.localStorage.setItem(PRESET_KEY, JSON.stringify(savedPresets));
  }, [savedPresets]);

  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(".panel, .kpi-card, .chart-box"));
    nodes.forEach((node) => {
      node.classList.remove("reveal-target", "reveal-in");
    });
    if (!appearance.effects.scrollReveal) {
      return;
    }

    nodes.forEach((node) => node.classList.add("reveal-target"));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("reveal-in");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [appearance.effects.scrollReveal]);

  const setAppearance = useCallback((next: Partial<AppearanceSettings>) => {
    setAppearanceState((prev) => normalizeAppearance({ ...prev, ...next }));
  }, []);

  const setEffect = useCallback((key: keyof EffectSettings, value: boolean) => {
    setAppearanceState((prev) => ({ ...prev, effects: { ...prev.effects, [key]: value } }));
  }, []);

  const applyPreset = useCallback((settings: AppearanceSettings) => {
    setAppearanceState(normalizeAppearance(settings));
  }, []);

  const savePreset = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const preset: SavedPreset = {
        id: crypto.randomUUID(),
        name: trimmed,
        settings: appearance
      };
      setSavedPresets((prev) => [preset, ...prev].slice(0, 12));
    },
    [appearance]
  );

  const deletePreset = useCallback((id: string) => {
    setSavedPresets((prev) => prev.filter((preset) => preset.id !== id));
  }, []);

  const randomize = useCallback(() => {
    setAppearanceState((prev) => ({
      ...prev,
      primary: randomHex(),
      secondary: randomHex(),
      accent: randomHex(),
      radius: Math.floor(Math.random() * 28),
      fontScale: Number((0.92 + Math.random() * 0.28).toFixed(2)),
      lineHeight: Number((1.3 + Math.random() * 0.45).toFixed(2)),
      texture: (["none", "grain", "scanlines", "carbon", "dots"] as const)[Math.floor(Math.random() * 5)],
      style: (["neon", "soft", "minimal", "terminal"] as const)[Math.floor(Math.random() * 4)]
    }));
  }, []);

  const value = useMemo<AppearanceContextValue>(
    () => ({
      appearance,
      setAppearance,
      setEffect,
      savedPresets,
      builtinPresets,
      applyPreset,
      savePreset,
      deletePreset,
      randomize
    }),
    [appearance, setAppearance, setEffect, savedPresets, applyPreset, savePreset, deletePreset, randomize]
  );

  return (
    <AppearanceContext.Provider value={value}>
      {children}
      {appearance.effects.mouseTrailer ? <MouseTrail /> : null}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) {
    throw new Error("useAppearance must be used within ThemeProvider");
  }
  return context;
}

