// V3 — full-bleed canon with:
// • Time range selector (1h / 24h / 7d / 30d)
// • 4 metrics: PNL, VOLUME, SIGNALS, WIN RATE
// • Live "scroll forward" on 1h: every 5s the leftmost slot drops, a new NOW enters from the right with a flash
// • Adaptive color scale per metric, tooltip, stats bar with sparklines

const { useState: vS, useEffect: vE, useRef: vR, useMemo: vM, useCallback: vC } = React;

const METRICS = [
  { id: 'pnl',     label: 'PNL',     unit: '$' },
  { id: 'volume',  label: 'VOLUME',  unit: '$' },
  { id: 'signals', label: 'СИГНАЛИ', unit: '' },
  { id: 'winrate', label: 'WIN RATE',unit: '%' },
];
const RANGES = ['1h', '24h', '7d', '30d'];

function getCellFill(metric, cell, intensityFn) {
  if (!cell || cell.signals === 0) return 'transparent';
  if (metric === 'pnl')     return pnlColor(intensityFn(cell), cell.pnl >= 0);
  if (metric === 'volume')  return volumeColor(intensityFn(cell));
  if (metric === 'signals') return signalsColor(intensityFn(cell));
  if (metric === 'winrate') return winRateColor(cell.winRate);
}
function getCellValue(metric, cell) {
  if (!cell || cell.signals === 0) return '';
  if (metric === 'pnl')     return fmtCellValue(cell.pnl);
  if (metric === 'volume')  return fmtCellValue(cell.volume);
  if (metric === 'signals') return String(cell.signals);
  if (metric === 'winrate') return Math.round(cell.winRate * 100) + '%';
}
function getValueColor(metric, cell) {
  if (metric === 'pnl')     return cell.pnl >= 0 ? '#dcffe2' : '#ffe2e0';
  if (metric === 'volume')  return '#fff5d9';
  if (metric === 'signals') return '#e6f1ff';
  if (metric === 'winrate') return cell.winRate >= 0.5 ? '#dcffe2' : '#ffe2e0';
  return TOKENS.text;
}

// ─────────── Range selector ───────────
function RangePill({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      background: active ? TOKENS.accent : 'transparent',
      border: `1px solid ${active ? TOKENS.accent : TOKENS.border}`,
      color: active ? '#1a1410' : TOKENS.textSec,
      fontFamily: TOKENS.font,
      fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
      textTransform: 'uppercase',
      padding: '6px 12px', borderRadius: 999,
      cursor: 'pointer', transition: 'all .12s',
      minWidth: 44,
    }}>{children}</button>
  );
}

function MetricTab({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      background: active ? TOKENS.panel2 : 'transparent',
      border: 'none',
      color: active ? TOKENS.text : TOKENS.textSec,
      fontFamily: TOKENS.font,
      fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
      textTransform: 'uppercase',
      padding: '7px 14px', borderRadius: 6,
      cursor: 'pointer', transition: 'all .12s',
      boxShadow: active ? `inset 0 0 0 1px ${TOKENS.borderHi}` : 'none',
    }}>{children}</button>
  );
}

// ─────────── Color scale legend ───────────
function ScaleLegendV3({ metric }) {
  let stops, label;
  if (metric === 'pnl') {
    stops = [
      { c: pnlColor(1, false), label: 'NEG' },
      { c: pnlColor(0.5, false) },
      { c: 'rgba(255,255,255,0.04)', zero: true, label: '0' },
      { c: pnlColor(0.5, true) },
      { c: pnlColor(1, true), label: 'POS' },
    ];
    label = 'PNL';
  } else if (metric === 'volume') {
    stops = [
      { c: volumeColor(0.05), label: 'LOW' },
      { c: volumeColor(0.3) },
      { c: volumeColor(0.6) },
      { c: volumeColor(0.85) },
      { c: volumeColor(1), label: 'HIGH' },
    ];
    label = 'Volume';
  } else if (metric === 'signals') {
    stops = [
      { c: signalsColor(0.05), label: 'LOW' },
      { c: signalsColor(0.3) },
      { c: signalsColor(0.6) },
      { c: signalsColor(0.85) },
      { c: signalsColor(1), label: 'HIGH' },
    ];
    label = 'Density';
  } else {
    stops = [
      { c: winRateColor(0.15), label: '15%' },
      { c: winRateColor(0.35) },
      { c: 'rgba(255,255,255,0.04)', zero: true, label: '50%' },
      { c: winRateColor(0.7) },
      { c: winRateColor(0.92), label: '92%' },
    ];
    label = 'Win rate';
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{
        fontSize: 9, color: TOKENS.textMuted, letterSpacing: 0.6,
        textTransform: 'uppercase', fontWeight: 600,
      }}>{label}</span>
      <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
        {stops.map((s, i) => (
          <div key={i} style={{
            width: 22, height: 14, background: s.c,
            border: s.zero ? `1px dashed ${TOKENS.borderHi}` : 'none',
            borderRadius: 3, position: 'relative',
          }}>
            {s.label && (
              <span style={{
                position: 'absolute', top: 17, left: '50%', transform: 'translateX(-50%)',
                fontSize: 8, color: s.zero ? TOKENS.textSec : TOKENS.textMuted,
                fontFamily: TOKENS.mono, fontWeight: 600, letterSpacing: 0.4, whiteSpace: 'nowrap',
              }}>{s.label}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────── Header ───────────
function HeaderV3({ metric, setMetric, range, setRange, isLive }) {
  return (
    <div style={{
      padding: '20px 32px 16px',
      borderBottom: `1px solid ${TOKENS.border}`,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24,
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 16 }}>
        <div style={{ width: 3, background: TOKENS.accent, borderRadius: 2, alignSelf: 'stretch' }}/>
        <div>
          <div style={{
            fontSize: 11, color: TOKENS.textSec, letterSpacing: 0.7,
            textTransform: 'uppercase', fontWeight: 600, marginBottom: 6,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            {isLive && <LiveDot/>}
            <span style={{ color: isLive ? TOKENS.pos : TOKENS.textSec }}>{isLive ? 'LIVE' : 'HISTORICAL'}</span>
            <span style={{ color: TOKENS.borderHi }}>·</span>
            <span>{window.WHALE_DATA.RANGES[range].sub}</span>
            <span style={{ color: TOKENS.borderHi }}>·</span>
            <span>41 whales tracked</span>
          </div>
          <h1 style={{
            margin: 0, fontSize: 22, fontWeight: 800,
            letterSpacing: 0.6, textTransform: 'uppercase', color: TOKENS.text, lineHeight: 1,
          }}>Whale Signal Heatmap</h1>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <ScaleLegendV3 metric={metric}/>
        <div style={{ width: 1, height: 26, background: TOKENS.border }}/>
        <div style={{ display: 'flex', gap: 6 }}>
          {RANGES.map(r => (
            <RangePill key={r} active={range === r} onClick={() => setRange(r)}>{r}</RangePill>
          ))}
        </div>
        <div style={{ width: 1, height: 26, background: TOKENS.border }}/>
        <div style={{ display: 'flex', gap: 0, background: TOKENS.panel, padding: 3, borderRadius: 8, border: `1px solid ${TOKENS.border}` }}>
          {METRICS.map(m => (
            <MetricTab key={m.id} active={metric === m.id} onClick={() => setMetric(m.id)}>
              {m.label}{m.unit ? ` (${m.unit})` : ''}
            </MetricTab>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────── Cell ───────────
function CellV3({ cell, metric, intensityFn, onHover, isNowCol, justArrived, gridKey }) {
  const ref = vR(null);
  const [hovered, setHovered] = vS(false);

  const isEmpty = !cell || cell.signals === 0;
  const bg = getCellFill(metric, cell, intensityFn);
  const value = isEmpty ? '' : getCellValue(metric, cell);
  const valColor = isEmpty ? TOKENS.text : getValueColor(metric, cell);

  const onEnter = () => {
    setHovered(true);
    if (isEmpty) return;
    const r = ref.current.getBoundingClientRect();
    const parent = ref.current.closest('[data-hm-grid-wrap]');
    const pr = parent.getBoundingClientRect();
    onHover({
      cell,
      anchor: {
        x: r.left - pr.left, y: r.top - pr.top,
        w: r.width, h: r.height,
        parentW: pr.width, parentH: pr.height,
      },
    });
  };
  const onLeave = () => { setHovered(false); onHover(null); };

  // animation:
  // - on grid load → cellLand
  // - on new tick arriving in NOW column → flashRing
  const animation = justArrived ? 'cellLand .35s cubic-bezier(.2,.7,.3,1) both, flashRing .9s ease-out .05s'
                                : 'cellLand .35s cubic-bezier(.2,.7,.3,1) both';

  return (
    <div
      ref={ref}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        background: bg,
        backgroundImage: isEmpty ? `radial-gradient(circle at 50% 50%, ${TOKENS.border} 0.5px, transparent 1px)` : 'none',
        backgroundSize: isEmpty ? '6px 6px' : 'auto',
        border: isEmpty ? `1px solid ${TOKENS.border}` : 'none',
        borderRadius: 7,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: isEmpty ? 'default' : 'pointer',
        transform: hovered && !isEmpty ? 'scale(1.1)' : 'scale(1)',
        transition: 'transform .14s cubic-bezier(.2,.7,.3,1), box-shadow .14s, background .3s',
        boxShadow: hovered && !isEmpty ? `0 8px 22px rgba(0,0,0,0.55), 0 0 0 1px ${TOKENS.borderHi}` : 'none',
        position: 'relative',
        zIndex: hovered ? 5 : 1,
        animation,
        outline: isNowCol && !isEmpty ? `1px solid rgba(63,185,80,0.28)` : 'none',
        outlineOffset: -1,
      }}
    >
      {!isEmpty && (
        <span style={{
          fontSize: 12, fontWeight: 700, color: valColor,
          fontVariantNumeric: 'tabular-nums', letterSpacing: 0.2,
          textShadow: '0 1px 2px rgba(0,0,0,0.5)',
        }}>{value}</span>
      )}
    </div>
  );
}

// ─────────── Grid ───────────
function GridV3({ bundle, metric, onHover, justArrivedTick, gridKey }) {
  const D = window.WHALE_DATA;
  const labelW = 124;
  const timeRowH = 28;
  const NUM = bundle.NUM_SLOTS;

  // Intensity fn per metric, computed against bundle.cells
  const intensityFn = vM(() => {
    if (metric === 'winrate') return (c) => c.winRate;
    const key = metric === 'pnl' ? 'pnl' : metric === 'volume' ? 'volume' : 'signals';
    return makeIntensityFn(bundle.cells, key);
  }, [bundle, metric]);

  // For 24h+ ranges with many slots, font shrinks
  const cellFontSize = NUM > 16 ? 10 : 12;

  return (
    <div data-hm-grid-wrap style={{
      display: 'grid',
      gridTemplateColumns: `${labelW}px repeat(${NUM}, minmax(0, 1fr))`,
      gridTemplateRows: `${timeRowH}px repeat(${D.CATEGORIES.length}, minmax(0, 1fr))`,
      gap: 5,
      width: '100%', height: '100%',
      position: 'relative',
      fontSize: cellFontSize,
    }}>
      <div/>
      {bundle.slotLabels.map((lbl, i) => {
        const showLabel = NUM <= 12 || i % Math.ceil(NUM / 12) === 0 || i === NUM - 1;
        const isNow = lbl === 'NOW' || lbl === 'TODAY';
        return (
          <div key={i} style={{
            fontSize: NUM > 16 ? 9 : 10, fontFamily: TOKENS.mono,
            color: isNow ? TOKENS.pos : TOKENS.textSec,
            fontWeight: isNow ? 700 : 500, letterSpacing: 0.5, textTransform: 'uppercase',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: showLabel ? 1 : 0,
          }}>
            {isNow ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: 6, background: TOKENS.pos, boxShadow: `0 0 6px ${TOKENS.pos}` }}/>
                {lbl}
              </span>
            ) : lbl}
          </div>
        );
      })}

      {D.CATEGORIES.map((cat) => (
        <React.Fragment key={cat.id}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', paddingRight: 10 }}>
            <span style={{
              background: cat.color, color: '#fff',
              fontSize: 10, fontWeight: 700, letterSpacing: 0.6,
              padding: '5px 10px', borderRadius: 3,
              textTransform: 'uppercase', whiteSpace: 'nowrap',
            }}>{cat.label}</span>
          </div>
          {Array.from({ length: NUM }).map((_, slot) => {
            const cell = bundle.cellAt(cat.id, slot);
            const isNowCol = slot === NUM - 1;
            const justArrived = isNowCol && justArrivedTick;
            return (
              <CellV3
                key={`${cat.id}-${slot}-${gridKey}`}
                cell={cell}
                metric={metric}
                intensityFn={intensityFn}
                onHover={onHover}
                isNowCol={isNowCol}
                justArrived={justArrived}
                gridKey={gridKey}
              />
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─────────── Stats bar v3 (4-metric aware) ───────────
function MiniSpark({ values, color, w = 84, h = 26 }) {
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const range = max - min || 1;
  const step = w / (values.length - 1 || 1);
  const pts = values.map((v, i) => [i * step, h - ((v - min) / range) * (h - 3) - 1.5]);
  const d = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const dArea = d + ` L${w},${h} L0,${h} Z`;
  const last = pts[pts.length - 1];
  const id = 'sg-' + color.slice(1) + '-' + values.length;
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={dArea} fill={`url(#${id})`}/>
      <path d={d} fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round"/>
      {last && <circle cx={last[0]} cy={last[1]} r="2" fill={color} stroke={TOKENS.bg} strokeWidth="1"/>}
    </svg>
  );
}

function StatsBarV3({ bundle }) {
  const D = window.WHALE_DATA;
  const NUM = bundle.NUM_SLOTS;

  const trendSignals = vM(() => {
    return Array.from({ length: NUM }, (_, i) => {
      return D.CATEGORIES.reduce((a, cat) => {
        const c = bundle.cellAt(cat.id, i);
        return a + (c ? c.signals : 0);
      }, 0);
    });
  }, [bundle]);

  const trendVolume = vM(() => {
    return Array.from({ length: NUM }, (_, i) => {
      return D.CATEGORIES.reduce((a, cat) => {
        const c = bundle.cellAt(cat.id, i);
        return a + (c ? c.volume : 0);
      }, 0);
    });
  }, [bundle]);

  const lastHalf = trendSignals.slice(Math.floor(NUM / 2)).reduce((a, b) => a + b, 0);
  const firstHalf = trendSignals.slice(0, Math.floor(NUM / 2)).reduce((a, b) => a + b, 0);
  const sigDelta = firstHalf > 0 ? Math.round(((lastHalf - firstHalf) / firstHalf) * 100) : 0;

  const items = [
    {
      label: 'Total Signals',
      value: bundle.stats.totalSignals.toLocaleString(),
      delta: { val: sigDelta, dir: sigDelta >= 0 ? 'up' : 'down' },
      spark: { values: trendSignals, color: TOKENS.link },
    },
    {
      label: 'Total Volume',
      value: fmtMoneyShort(bundle.stats.totalVolume),
      sub: 'across slots',
      spark: { values: trendVolume, color: TOKENS.accent },
    },
    {
      label: 'Win Rate',
      value: Math.round(bundle.stats.overallWinRate * 100) + '%',
      pnlDir: bundle.stats.overallWinRate >= 0.5 ? 'up' : 'down',
      sub: 'weighted by volume',
    },
    {
      label: 'Top Category',
      badge: bundle.stats.topCategory,
      sub: `${(bundle.cells.filter(c => c.cat === bundle.stats.topCategory.id).reduce((a, c) => a + c.signals, 0)).toLocaleString()} signals`,
    },
    {
      label: 'Top Whale',
      whale: bundle.stats.topWhale,
      sub: '8 trades · +$42.3k',
    },
    {
      label: 'Active Whales',
      value: bundle.stats.activeWhales.toString(),
      suffix: '/ 41',
      bar: bundle.stats.activeWhales / 41,
    },
  ];

  return (
    <div style={{
      borderTop: `1px solid ${TOKENS.border}`,
      padding: '14px 32px',
      background: TOKENS.panel,
      display: 'grid',
      gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
      gap: 22,
      flexShrink: 0,
    }}>
      {items.map((it, i) => (
        <StatItem key={it.label} item={it} divider={i < items.length - 1}/>
      ))}
    </div>
  );
}

function StatItem({ item, divider }) {
  return (
    <div style={{ position: 'relative', paddingRight: divider ? 20 : 0 }}>
      {divider && (
        <div style={{ position: 'absolute', right: 0, top: 4, bottom: 4, width: 1, background: TOKENS.border }}/>
      )}
      <div style={{
        fontSize: 9, color: TOKENS.textMuted, letterSpacing: 0.7,
        textTransform: 'uppercase', fontWeight: 600, marginBottom: 6,
      }}>{item.label}</div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
          {item.badge ? (
            <span style={{
              alignSelf: 'flex-start',
              background: item.badge.color, color: '#fff',
              fontSize: 11, fontWeight: 700, letterSpacing: 0.4,
              padding: '4px 9px', borderRadius: 3, textTransform: 'uppercase',
            }}>{item.badge.label}</span>
          ) : item.whale ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 9, height: 9, borderRadius: 9, background: item.whale.color, boxShadow: `0 0 8px ${item.whale.color}88`, flexShrink: 0 }}/>
              <span style={{ fontSize: 16, fontWeight: 700, color: TOKENS.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.whale.alias}</span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{
                fontSize: 19, fontWeight: 800,
                color: item.pnlDir ? (item.pnlDir === 'up' ? TOKENS.pos : TOKENS.neg) : TOKENS.text,
                fontVariantNumeric: 'tabular-nums', letterSpacing: 0.2, lineHeight: 1,
              }}>{item.value}</span>
              {item.suffix && <span style={{ fontSize: 12, color: TOKENS.textSec, fontWeight: 600 }}>{item.suffix}</span>}
              {item.delta && (
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  color: item.delta.dir === 'up' ? TOKENS.pos : TOKENS.neg,
                  fontVariantNumeric: 'tabular-nums', letterSpacing: 0.2,
                }}>
                  {item.delta.dir === 'up' ? '▲' : '▼'} {Math.abs(item.delta.val)}%
                </span>
              )}
            </div>
          )}
          {item.sub && (
            <span style={{ fontSize: 10, color: TOKENS.textMuted, fontFamily: TOKENS.mono, letterSpacing: 0.2 }}>
              {item.sub}
            </span>
          )}
          {item.bar !== undefined && (
            <div style={{ marginTop: 4, height: 3, borderRadius: 3, background: TOKENS.border, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${item.bar * 100}%`, background: `linear-gradient(to right, ${TOKENS.pos}, ${TOKENS.accent})` }}/>
            </div>
          )}
        </div>
        {item.spark && <MiniSpark values={item.spark.values} color={item.spark.color}/>}
      </div>
    </div>
  );
}

// ─────────── Root ───────────
function HeatmapV3() {
  const [metric, setMetric] = vS('pnl');
  const [range, setRange] = vS('1h');
  const [tickOffset, setTickOffset] = vS(0); // grows over time on 1h
  const [hover, setHover] = vS(null);
  const [justArrived, setJustArrived] = vS(false);

  const isLive = range === '1h';

  // Build the bundle for the active range + offset
  const bundle = vM(() => {
    return window.WHALE_DATA.makeBundle(range, isLive ? tickOffset : 0);
  }, [range, tickOffset, isLive]);

  // Live ticker — only on 1h. Every 5s, advance offset by 1.
  vE(() => {
    if (!isLive) return;
    const id = setInterval(() => {
      setTickOffset(o => o + 1);
      setJustArrived(true);
      setTimeout(() => setJustArrived(false), 1000);
    }, 5000);
    return () => clearInterval(id);
  }, [isLive]);

  // Reset offset when switching ranges
  vE(() => { setTickOffset(0); }, [range]);

  return (
    <div style={{
      width: '100%', height: '100%', minHeight: '100vh',
      background: TOKENS.bg, color: TOKENS.text, fontFamily: TOKENS.font,
      display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
    }}>
      <HeaderV3
        metric={metric} setMetric={setMetric}
        range={range} setRange={setRange}
        isLive={isLive}
      />

      <div style={{ flex: 1, padding: '18px 32px 14px', position: 'relative', minHeight: 0 }}>
        <GridV3
          bundle={bundle}
          metric={metric}
          onHover={setHover}
          justArrivedTick={justArrived}
          gridKey={`${range}-${tickOffset}`}
        />
        {hover && <Tooltip cell={hover.cell} anchor={hover.anchor} metric={metric} rangeKey={range}/>}
      </div>

      <StatsBarV3 bundle={bundle}/>
    </div>
  );
}

window.HeatmapV3 = HeatmapV3;
