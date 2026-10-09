'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './theme-customizer.module.css';

const PRESETS = [
  { name: 'Bordô', accent: '#8F2945', dark: '#751F36', soft: '#F6EAEE' },
  { name: 'Verde', accent: '#21A968', dark: '#168451', soft: '#E9F7F0' },
  { name: 'Esmeralda', accent: '#139B82', dark: '#0E7665', soft: '#E8F7F4' },
  { name: 'Turquesa', accent: '#239DA5', dark: '#187980', soft: '#E8F6F7' },
  { name: 'Azul', accent: '#2C94C7', dark: '#1F7199', soft: '#E8F4FA' },
  { name: 'Royal', accent: '#447CD5', dark: '#315FA8', soft: '#EBF1FB' },
  { name: 'Índigo', accent: '#5D63CC', dark: '#464BA3', soft: '#EEEFFB' },
  { name: 'Violeta', accent: '#7958C5', dark: '#5E42A0', soft: '#F0ECFA' },
  { name: 'Rosa', accent: '#C25487', dark: '#9B3D69', soft: '#FAEBF2' },
  { name: 'Terracota', accent: '#C65E5A', dark: '#9D4642', soft: '#FAECEB' },
  { name: 'Laranja', accent: '#D9821B', dark: '#AA6412', soft: '#FCF1E4' },
  { name: 'Mostarda', accent: '#C89A25', dark: '#997519', soft: '#FAF4E5' },
];

const MODES = {
  light: {
    bg: '#F8F5F4', surface: '#FFFFFF', softSurface: '#FBF9F8',
    text: '#171417', muted: '#756D70', border: '#EADFE2', topbar: 'rgba(255,255,255,.95)'
  },
  neutral: {
    bg: '#EEEAE9', surface: '#F8F6F5', softSurface: '#F2EFEE',
    text: '#1B1819', muted: '#6E6769', border: '#DDD4D6', topbar: 'rgba(248,246,245,.95)'
  },
  dark: {
    bg: '#171417', surface: '#211D1F', softSurface: '#292326',
    text: '#F7F3F4', muted: '#B8AFB2', border: '#3B3336', topbar: 'rgba(33,29,31,.95)'
  },
};

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16));
}

function rgbToHex(rgb) {
  return '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function mix(base, tint, amount) {
  const a = hexToRgb(base);
  const b = hexToRgb(tint);
  return rgbToHex(a.map((v, i) => v + (b[i] - v) * amount));
}

function applyTheme(config) {
  const root = document.documentElement;
  const preset = PRESETS.find((item) => item.accent === config.accent) || PRESETS[0];
  const mode = MODES[config.mode] || MODES.light;
  const tint = Math.min(20, Math.max(0, Number(config.tint || 0))) / 100;

  root.style.setProperty('--gold', preset.accent);
  root.style.setProperty('--gold-dark', preset.dark);
  root.style.setProperty('--gold-soft', preset.soft);
  root.style.setProperty('--bg', mix(mode.bg, preset.accent, tint * .42));
  root.style.setProperty('--surface', mix(mode.surface, preset.accent, tint * .12));
  root.style.setProperty('--surface-soft', mix(mode.softSurface, preset.accent, tint * .22));
  root.style.setProperty('--text', mode.text);
  root.style.setProperty('--muted', mode.muted);
  root.style.setProperty('--border', mix(mode.border, preset.accent, tint * .18));
  root.style.setProperty('--sidebar-bg', mix(mode.surface, preset.accent, tint * .08));
  root.style.setProperty('--topbar-bg', mode.topbar);
  root.dataset.appearance = config.mode;
}

export default function ThemeCustomizer() {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState({ accent: '#8F2945', mode: 'light', tint: 0 });

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('tideplace-theme') || 'null');
      if (saved) setConfig((current) => ({ ...current, ...saved }));
    } catch {}
  }, []);

  useEffect(() => {
    applyTheme(config);
    try { localStorage.setItem('tideplace-theme', JSON.stringify(config)); } catch {}
  }, [config]);

  const activePreset = useMemo(
    () => PRESETS.find((item) => item.accent === config.accent) || PRESETS[0],
    [config.accent]
  );

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.trigger} onClick={() => setOpen(true)}>
        <span aria-hidden="true">☷</span> Personalizar
      </button>

      {open && (
        <>
          <button className={styles.backdrop} aria-label="Fechar personalização" onClick={() => setOpen(false)} />
          <aside className={styles.panel} aria-label="Personalizar experiência">
            <div className={styles.header}>
              <div><strong>Experiência</strong><span>Cor e aparência do seu jeito.</span></div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar">×</button>
            </div>

            <section>
              <span className={styles.label}>◉ COR DA INTERFACE</span>
              <div className={styles.swatches}>
                {PRESETS.map((preset) => (
                  <button
                    type="button"
                    key={preset.accent}
                    title={preset.name}
                    aria-label={preset.name}
                    aria-pressed={config.accent === preset.accent}
                    className={config.accent === preset.accent ? styles.selected : ''}
                    style={{ background: preset.accent }}
                    onClick={() => setConfig((current) => ({ ...current, accent: preset.accent }))}
                  />
                ))}
              </div>
              <div className={styles.colorSummary}>
                <i style={{ background: activePreset.accent }} />
                <div><strong>{activePreset.name}</strong><span>{activePreset.accent}</span></div>
              </div>
            </section>

            <section>
              <span className={styles.label}>▣ APARÊNCIA</span>
              <div className={styles.segmented}>
                <button type="button" className={config.mode === 'light' ? styles.active : ''} onClick={() => setConfig((c) => ({ ...c, mode: 'light' }))}>☼ Claro</button>
                <button type="button" className={config.mode === 'neutral' ? styles.active : ''} onClick={() => setConfig((c) => ({ ...c, mode: 'neutral' }))}>▱ Neutro</button>
                <button type="button" className={config.mode === 'dark' ? styles.active : ''} onClick={() => setConfig((c) => ({ ...c, mode: 'dark' }))}>☾ Escuro</button>
              </div>
            </section>

            <section>
              <div className={styles.rangeTop}><div><strong>Tom no fundo</strong><span>Quanto da sua cor entra no ambiente.</span></div><b>{config.tint}%</b></div>
              <input
                className={styles.range}
                type="range"
                min="0"
                max="20"
                step="1"
                value={config.tint}
                onChange={(event) => setConfig((c) => ({ ...c, tint: Number(event.target.value) }))}
              />
              <div className={styles.rangeLegend}><span>Quase branco</span><span>Mais colorido</span></div>
            </section>

            <button
              type="button"
              className={styles.reset}
              onClick={() => setConfig({ accent: '#8F2945', mode: 'light', tint: 0 })}
            >
              Restaurar TidePlace
            </button>
          </aside>
        </>
      )}
    </div>
  );
}
