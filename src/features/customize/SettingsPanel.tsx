import { useMemo, useState } from "react";
import { useAppearance } from "../../ui/theme/ThemeContext";

export function SettingsPanel() {
  const { appearance, setAppearance, setEffect, savedPresets, builtinPresets, applyPreset, savePreset, deletePreset, randomize } = useAppearance();
  const [presetName, setPresetName] = useState("");

  const radiusLabel = useMemo(() => `${Math.round(appearance.radius)}px`, [appearance.radius]);

  return (
    <section className="stack-lg">
      <header>
        <h2 className="glitch-title" data-text="Appearance Engine">
          Appearance Engine
        </h2>
        <p className="muted">High-Contrast Digital Noir controls. Tune everything live with zero-latency CSS variable switching.</p>
      </header>

      <article className="panel">
        <div className="panel-head">
          <h3>Quick Presets</h3>
          <button className="chip-btn active-chip" onClick={randomize}>
            Randomize
          </button>
        </div>
        <div className="toggle-group">
          {builtinPresets.map((preset) => (
            <button key={preset.id} className="chip-btn" onClick={() => applyPreset(preset.settings)}>
              {preset.name}
            </button>
          ))}
        </div>
      </article>

      <article className="panel">
        <h3>Color Tuning</h3>
        <div className="form-grid">
          <label>
            Primary
            <input type="color" value={appearance.primary} onChange={(e) => setAppearance({ primary: e.target.value })} />
          </label>
          <label>
            Secondary
            <input type="color" value={appearance.secondary} onChange={(e) => setAppearance({ secondary: e.target.value })} />
          </label>
          <label>
            Accent
            <input type="color" value={appearance.accent} onChange={(e) => setAppearance({ accent: e.target.value })} />
          </label>
        </div>
      </article>

      <article className="panel">
        <h3>Typography</h3>
        <div className="form-grid">
          <label>
            Font Family
            <select value={appearance.fontFamily} onChange={(e) => setAppearance({ fontFamily: e.target.value as "sans" | "serif" | "mono" })}>
              <option value="sans">Sans</option>
              <option value="serif">Serif</option>
              <option value="mono">Mono</option>
            </select>
          </label>
          <label>
            Font Scale ({appearance.fontScale.toFixed(2)}x)
            <input
              type="range"
              min={0.8}
              max={1.4}
              step={0.01}
              value={appearance.fontScale}
              onChange={(e) => setAppearance({ fontScale: Number(e.target.value) })}
            />
          </label>
          <label>
            Line Height ({appearance.lineHeight.toFixed(2)})
            <input
              type="range"
              min={1.15}
              max={2}
              step={0.01}
              value={appearance.lineHeight}
              onChange={(e) => setAppearance({ lineHeight: Number(e.target.value) })}
            />
          </label>
        </div>
      </article>

      <article className="panel">
        <h3>Shape & Density</h3>
        <div className="form-grid">
          <label>
            Border Radius ({radiusLabel})
            <input
              type="range"
              min={0}
              max={48}
              step={1}
              value={appearance.radius}
              onChange={(e) => setAppearance({ radius: Number(e.target.value) })}
            />
          </label>
          <label>
            Layout Density
            <select value={appearance.density} onChange={(e) => setAppearance({ density: e.target.value as "cozy" | "comfortable" | "compact" })}>
              <option value="cozy">Cozy</option>
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </label>
          <label>
            Texture
            <select
              value={appearance.texture}
              onChange={(e) => setAppearance({ texture: e.target.value as "none" | "grain" | "scanlines" | "carbon" | "dots" })}
            >
              <option value="none">None</option>
              <option value="grain">Grain</option>
              <option value="scanlines">Scanlines</option>
              <option value="carbon">Carbon Fiber</option>
              <option value="dots">Halftone Dots</option>
            </select>
          </label>
          <label>
            Style
            <select value={appearance.style} onChange={(e) => setAppearance({ style: e.target.value as "neon" | "soft" | "minimal" | "terminal" })}>
              <option value="neon">Neon</option>
              <option value="soft">Soft Glass</option>
              <option value="minimal">Minimal</option>
              <option value="terminal">Terminal</option>
            </select>
          </label>
        </div>
      </article>

      <article className="panel">
        <h3>Artistic Effects</h3>
        <div className="toggle-grid">
          <label className="switch-row"><input type="checkbox" checked={appearance.effects.glassmorphism} onChange={(e) => setEffect("glassmorphism", e.target.checked)} />Glassmorphism blur</label>
          <label className="switch-row"><input type="checkbox" checked={appearance.effects.noiseTexture} onChange={(e) => setEffect("noiseTexture", e.target.checked)} />Film grain texture</label>
          <label className="switch-row"><input type="checkbox" checked={appearance.effects.interactiveGlow} onChange={(e) => setEffect("interactiveGlow", e.target.checked)} />Interactive glows</label>
          <label className="switch-row"><input type="checkbox" checked={appearance.effects.ambientMotion} onChange={(e) => setEffect("ambientMotion", e.target.checked)} />Ambient background motion</label>
          <label className="switch-row"><input type="checkbox" checked={appearance.effects.mouseTrailer} onChange={(e) => setEffect("mouseTrailer", e.target.checked)} />Mouse trailer</label>
          <label className="switch-row"><input type="checkbox" checked={appearance.effects.scrollReveal} onChange={(e) => setEffect("scrollReveal", e.target.checked)} />Scroll reveal animations</label>
          <label className="switch-row"><input type="checkbox" checked={appearance.effects.glitchHeaders} onChange={(e) => setEffect("glitchHeaders", e.target.checked)} />Glitch headers on hover</label>
        </div>
      </article>

      <article className="panel">
        <h3>Saved Presets</h3>
        <div className="panel-head">
          <input placeholder="Preset name..." value={presetName} onChange={(e) => setPresetName(e.target.value)} />
          <button
            onClick={() => {
              savePreset(presetName);
              setPresetName("");
            }}
          >
            Save Preset
          </button>
        </div>
        {savedPresets.length === 0 ? (
          <p className="muted">No saved presets yet.</p>
        ) : (
          <div className="toggle-group">
            {savedPresets.map((preset) => (
              <div className="preset-chip" key={preset.id}>
                <button className="chip-btn" onClick={() => applyPreset(preset.settings)}>
                  {preset.name}
                </button>
                <button className="danger-btn" onClick={() => deletePreset(preset.id)}>
                  x
                </button>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}

