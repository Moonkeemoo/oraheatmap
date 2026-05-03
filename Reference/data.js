// Mock data — multi-range, multi-metric, with a live "scroll forward" generator.
// Ranges: 1h (12×5min), 24h (24×1h), 7d (7×1d), 30d (30×1d).
// Metrics per cell: signals, pnl, volume, winRate (0..1).

window.WHALE_DATA = (() => {
  const CATEGORIES = [
    { id: 'politics', label: 'POLITICS',  color: '#1f6feb' },
    { id: 'crypto',   label: 'CRYPTO',    color: '#f0b429' },
    { id: 'sports',   label: 'SPORTS',    color: '#f85149' },
    { id: 'culture',  label: 'CULTURE',   color: '#a371f7' },
    { id: 'science',  label: 'SCIENCE',   color: '#3fb950' },
    { id: 'finance',  label: 'FINANCE',   color: '#39d2c0' },
    { id: 'weather',  label: 'WEATHER',   color: '#768390' },
  ];

  const WHALES = [
    { alias: '0xDegenKing',   color: '#f0b429' },
    { alias: 'PolyHunter',    color: '#3fb950' },
    { alias: 'NightTrader',   color: '#a371f7' },
    { alias: 'WhaleWatch',    color: '#58a6ff' },
    { alias: 'AlphaSeeker',   color: '#39d2c0' },
    { alias: 'SilentBidder',  color: '#f85149' },
    { alias: 'MarketMaker7',  color: '#ff8c42' },
    { alias: 'OracleEye',     color: '#e879f9' },
    { alias: 'DeepStack',     color: '#22d3ee' },
    { alias: 'FastFinger',    color: '#facc15' },
  ];

  const MARKETS = {
    politics: ['Trump 2028 win?', 'Senate flip Q3', 'EU election', 'Fed chair'],
    crypto:   ['BTC > 150k EOY', 'ETH ETF flows', 'SOL > 300', 'Stablecoin cap'],
    sports:   ['Celtics repeat?', 'Lakers playoffs', 'Champions league', 'NFL MVP'],
    culture:  ['Oscar best pic', 'Grammy AOTY', 'Box office #1', 'Album of year'],
    science:  ['CRISPR approval', 'Mars launch date', 'Fusion milestone', 'AGI 2026?'],
    finance:  ['Rate cut March', 'Recession Q2', 'GDP > 3%', 'CPI < 2.5'],
    weather:  ['Hurricane cat 5', 'NYC snow > 6"', 'LA rain Q1', 'Heat record'],
  };

  const RANGES = {
    '1h':  { slots: 12, label: '1h',  unit: 'm', step: 5,    sub: 'last 60 min',  fmt: (i, n) => i === n-1 ? 'NOW' : `-${(n-1-i)*5}m` },
    '24h': { slots: 24, label: '24h', unit: 'h', step: 1,    sub: 'last 24 hours',fmt: (i, n) => i === n-1 ? 'NOW' : `-${n-1-i}h` },
    '7d':  { slots: 7,  label: '7d',  unit: 'd', step: 1,    sub: 'last 7 days',  fmt: (i, n) => i === n-1 ? 'TODAY' : `-${n-1-i}d` },
    '30d': { slots: 30, label: '30d', unit: 'd', step: 1,    sub: 'last 30 days', fmt: (i, n) => i === n-1 ? 'TODAY' : `-${n-1-i}d` },
  };

  // PRNG factory — separate seed per (range, slot) so cells stay stable
  function prng(seed) {
    let s = seed;
    return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  }

  function generateCell(rangeKey, catId, slotIdx, totalSlots, seedOffset = 0) {
    const r = prng(hash(rangeKey + catId + ':' + slotIdx + ':' + seedOffset));
    // recency weight — recent cells busier
    const recency = 0.35 + (slotIdx / totalSlots) * 0.7;
    // for longer ranges activity scales up (aggregated)
    const scale = rangeKey === '1h' ? 1 : rangeKey === '24h' ? 5 : rangeKey === '7d' ? 30 : 25;
    const isEmpty = r() < (0.18 - recency * 0.1);
    if (isEmpty) {
      return { cat: catId, slot: slotIdx, signals: 0, pnl: 0, volume: 0, avgSize: 0, winRate: 0, trades: [] };
    }
    const direction = r() > 0.45 ? 1 : -1;
    const signals = Math.floor((1 + r() * 11 * recency) * scale);
    const avgSize = Math.round(2000 + r() * 18000);
    const volume = signals * avgSize;
    const pnl = Math.round(direction * (r() * 80000 + 2000) * recency * Math.sqrt(scale));
    // Win rate: skew toward direction (trends agree with PNL sign)
    const wrBase = 0.5 + direction * (0.05 + r() * 0.25);
    const winRate = Math.max(0.15, Math.min(0.92, wrBase));

    const trades = [];
    const tradeCount = Math.min(Math.max(2, Math.floor(signals / 3)), 3);
    for (let i = 0; i < tradeCount; i++) {
      const w = WHALES[Math.floor(r() * WHALES.length)];
      const side = r() > (direction > 0 ? 0.25 : 0.75) ? 'YES' : 'NO';
      const size = Math.round(1000 + r() * 25000);
      const result = r() > (1 - winRate) ? '+' : '-';
      const resultPct = (r() * 18 + 2).toFixed(1);
      trades.push({
        whale: w.alias, color: w.color, side, size,
        result: `${result}${resultPct}%`,
        market: MARKETS[catId][Math.floor(r() * MARKETS[catId].length)],
      });
    }
    return { cat: catId, slot: slotIdx, signals, pnl, volume, avgSize, winRate, trades };
  }

  function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    return Math.abs(h) || 1;
  }

  // Build a complete grid for a range, with an optional offset (used to "scroll" 1h)
  function buildGrid(rangeKey, offset = 0) {
    const range = RANGES[rangeKey];
    const slots = range.slots;
    const cells = [];
    for (const cat of CATEGORIES) {
      for (let t = 0; t < slots; t++) {
        // For scroll: cell at slot t maps to global tick (offset + t)
        // The newest tick is at slot=slots-1 → globalTick = offset + slots - 1
        cells.push(generateCell(rangeKey, cat.id, t, slots, offset));
      }
    }
    return cells;
  }

  function makeBundle(rangeKey, offset = 0) {
    const range = RANGES[rangeKey];
    const cells = buildGrid(rangeKey, offset);
    const slotLabels = Array.from({ length: range.slots }, (_, i) => range.fmt(i, range.slots));

    const totalSignals = cells.reduce((a, c) => a + c.signals, 0);
    const totalVolume  = cells.reduce((a, c) => a + c.volume, 0);
    const byCat = {};
    for (const c of cells) byCat[c.cat] = (byCat[c.cat] || 0) + c.signals;
    const topCatId = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0][0];
    const topCat = CATEGORIES.find(c => c.id === topCatId);

    const wrAll = cells.filter(c => c.signals > 0);
    const overallWinRate = wrAll.length
      ? wrAll.reduce((a, c) => a + c.winRate * c.signals, 0) / wrAll.reduce((a, c) => a + c.signals, 0)
      : 0;

    return {
      rangeKey,
      range,
      NUM_SLOTS: range.slots,
      slotLabels,
      cells,
      cellAt: (catId, slot) => cells.find(c => c.cat === catId && c.slot === slot),
      stats: {
        totalSignals,
        totalVolume,
        topCategory: topCat,
        topWhale: WHALES[3],
        activeWhales: 27,
        overallWinRate,
      },
    };
  }

  return {
    CATEGORIES,
    WHALES,
    RANGES,
    buildGrid,
    makeBundle,
    // Default 1h bundle for back-compat
    ...makeBundle('1h', 0),
  };
})();
