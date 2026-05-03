// Shared bits: tokens, formatters, color helpers, Tooltip, LiveDot.

const TOKENS = {
  bg:        '#0d1117',
  panel:     '#161b22',
  panel2:    '#1c2128',
  border:    '#21262d',
  borderHi:  '#30363d',
  text:      '#e6edf3',
  textSec:   '#7d8590',
  textMuted: '#8b949e',
  accent:    '#f0b429',
  link:      '#58a6ff',
  pos:       '#3fb950',
  posDim:    '#238636',
  posDeep:   '#2ea043',
  neg:       '#f85149',
  negDeep:   '#da3633',
  font: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
};

function fmtMoney(n) {
  const abs = Math.abs(n);
  let s;
  if (abs >= 1e6) s = (n / 1e6).toFixed(1) + 'M';
  else if (abs >= 1e3) s = (n / 1e3).toFixed(abs >= 1e4 ? 0 : 1) + 'k';
  else s = String(Math.round(n));
  return (n > 0 ? '+$' : n < 0 ? '-$' : '$') + s.replace('-', '');
}
function fmtCellValue(n) {
  const abs = Math.abs(n);
  if (abs >= 1e3) return (n / 1e3).toFixed(abs >= 1e4 ? 0 : 1) + 'k';
  return String(Math.round(n));
}
function fmtMoneyShort(n) {
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'k';
  return '$' + n;
}

// Map a value to a fill color for PNL.
// Value range varies; we pass an intensity 0..1 alongside sign.
function pnlColor(intensity, isPos) {
  // intensity 0..1 → alpha 0.08..0.85
  const a = 0.08 + Math.pow(intensity, 0.7) * 0.77;
  // green or red base (oklch-ish via rgb of design tokens)
  const rgb = isPos ? '63, 185, 80' : '248, 81, 73';
  return `rgba(${rgb}, ${a.toFixed(3)})`;
}
function signalsColor(intensity) {
  // single-hue cyan-blue ramp for "signal count" tab
  const a = 0.08 + Math.pow(intensity, 0.7) * 0.85;
  return `rgba(88, 166, 255, ${a.toFixed(3)})`;
}
function volumeColor(intensity) {
  // amber-yellow ramp for volume
  const a = 0.08 + Math.pow(intensity, 0.7) * 0.85;
  return `rgba(240, 180, 41, ${a.toFixed(3)})`;
}
function winRateColor(wr) {
  // divergent around 0.5: red < 50%, green > 50%
  if (wr <= 0) return 'transparent';
  const dist = Math.abs(wr - 0.5) * 2; // 0..1
  const a = 0.12 + Math.pow(dist, 0.7) * 0.73;
  const rgb = wr >= 0.5 ? '63, 185, 80' : '248, 81, 73';
  return `rgba(${rgb}, ${a.toFixed(3)})`;
}

// Compute intensity from absolute pnl (per-grid normalization).
function makeIntensityFn(cells, key, transform) {
  const vals = cells.map(c => Math.abs(transform ? transform(c) : c[key])).filter(v => v > 0);
  const max = vals.length ? Math.max(...vals) : 1;
  return (cell) => {
    const v = Math.abs(transform ? transform(cell) : cell[key]);
    return max > 0 ? Math.min(1, v / max) : 0;
  };
}

// Tooltip — adapts to current metric
function Tooltip({ cell, anchor, metric, rangeKey }) {
  if (!cell || !anchor) return null;
  const cat = window.WHALE_DATA.CATEGORIES.find(c => c.id === cell.cat);
  const range = window.WHALE_DATA.RANGES[rangeKey || '1h'];
  const slotLabel = window.WHALE_DATA.slotLabels[cell.slot];

  // Position: prefer above the anchor, fall back below if too close to top
  const tipW = 280;
  const tipH = 180;
  const margin = 10;
  let left = anchor.x + anchor.w / 2 - tipW / 2;
  let top  = anchor.y - tipH - margin;
  if (top < 8) top = anchor.y + anchor.h + margin;
  left = Math.max(8, Math.min(left, (anchor.parentW || 1200) - tipW - 8));

  return (
    <div style={{
      position: 'absolute',
      left, top,
      width: tipW,
      background: TOKENS.panel,
      border: `1px solid ${TOKENS.borderHi}`,
      borderRadius: 8,
      padding: '12px 14px',
      fontFamily: TOKENS.font,
      color: TOKENS.text,
      boxShadow: '0 10px 30px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,0,0,0.4)',
      pointerEvents: 'none',
      zIndex: 30,
      animation: 'tipIn .12s ease-out',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{
          background: cat.color, color: '#fff',
          fontSize: 9, fontWeight: 700, letterSpacing: 0.4,
          padding: '3px 6px', borderRadius: 3, textTransform: 'uppercase',
        }}>{cat.label}</span>
        <span style={{ color: TOKENS.textSec, fontSize: 11, fontFamily: TOKENS.mono }}>
          {slotLabel === 'NOW' || slotLabel === 'TODAY' ? `last ${range.step}${range.unit}` : slotLabel}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
        <Stat label="SIGNALS" value={cell.signals} />
        <Stat label="PNL" value={fmtMoney(cell.pnl)} color={cell.pnl > 0 ? TOKENS.pos : cell.pnl < 0 ? TOKENS.neg : TOKENS.textSec} />
        <Stat label="VOLUME" value={cell.volume ? fmtMoneyShort(cell.volume) : '—'} />
        <Stat label="WIN" value={cell.signals ? Math.round(cell.winRate * 100) + '%' : '—'} color={cell.winRate >= 0.5 ? TOKENS.pos : TOKENS.neg}/>
      </div>

      {cell.trades.length > 0 && (
        <div style={{ borderTop: `1px solid ${TOKENS.border}`, paddingTop: 8 }}>
          <div style={{
            fontSize: 9, letterSpacing: 0.5, color: TOKENS.textMuted,
            textTransform: 'uppercase', marginBottom: 6, fontWeight: 600,
          }}>Top signals</div>
          {cell.trades.slice(0, 3).map((t, i) => (
            <div key={i} style={{
              display: 'grid',
              gridTemplateColumns: '8px 1fr auto auto',
              alignItems: 'center', gap: 8,
              fontSize: 11, marginBottom: 3,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: 8, background: t.color }}/>
              <span style={{ color: TOKENS.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.whale}</span>
              <span style={{
                color: t.side === 'YES' ? TOKENS.pos : TOKENS.neg,
                fontWeight: 700, fontSize: 10,
              }}>{t.side}</span>
              <span style={{ color: TOKENS.textSec, fontFamily: TOKENS.mono, fontSize: 10 }}>
                {fmtMoneyShort(t.size)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div style={{
        fontSize: 9, color: TOKENS.textMuted, letterSpacing: 0.5,
        textTransform: 'uppercase', fontWeight: 600, marginBottom: 2,
      }}>{label}</div>
      <div style={{ fontSize: 14, color: color || TOKENS.text, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  );
}

function LiveDot({ size = 8 }) {
  return (
    <span style={{
      display: 'inline-block', position: 'relative',
      width: size, height: size,
    }}>
      <span style={{
        position: 'absolute', inset: 0,
        background: TOKENS.pos, borderRadius: '50%',
        boxShadow: `0 0 8px ${TOKENS.pos}`,
      }}/>
      <span style={{
        position: 'absolute', inset: 0,
        background: TOKENS.pos, borderRadius: '50%',
        animation: 'livePulse 1.6s ease-out infinite',
      }}/>
    </span>
  );
}

// Inject shared keyframes once
if (typeof document !== 'undefined' && !document.getElementById('hm-shared-styles')) {
  const s = document.createElement('style');
  s.id = 'hm-shared-styles';
  s.textContent = `
    @keyframes livePulse {
      0%   { transform: scale(1);   opacity: 0.55; }
      80%  { transform: scale(2.4); opacity: 0; }
      100% { transform: scale(2.4); opacity: 0; }
    }
    @keyframes tipIn {
      0%   { opacity: 0; transform: translateY(-2px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    @keyframes cellLand {
      0%   { transform: scale(0.6); opacity: 0; box-shadow: 0 0 0 4px rgba(255,255,255,0.4); }
      100% { transform: scale(1);   opacity: 1; box-shadow: 0 0 0 0 rgba(255,255,255,0); }
    }
    @keyframes flashRing {
      0%   { box-shadow: 0 0 0 0 rgba(255,255,255,0.55); }
      100% { box-shadow: 0 0 0 12px rgba(255,255,255,0); }
    }
    @keyframes nowSweep {
      0%, 100% { opacity: 0.55; }
      50%      { opacity: 1; }
    }
  `;
  document.head.appendChild(s);
}

Object.assign(window, {
  TOKENS, fmtMoney, fmtMoneyShort, fmtCellValue,
  pnlColor, signalsColor, volumeColor, winRateColor, makeIntensityFn,
  Tooltip, LiveDot,
});
