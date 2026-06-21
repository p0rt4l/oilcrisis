/* ============================================================
   OIL CRISIS US — Strategic Petroleum Reserve Dashboard
   Application Logic — EIA API, Chart.js, Animations
   ============================================================ */

// ---- Configuration ----
const CONFIG = {
  // EIA API (free, no key required with DEMO_KEY for limited use)
  // For production on oilcrisis.us, register at https://www.eia.gov/opendata/ for a real key
  EIA_API_KEY: 'BdJIZE2H7FiKlYeJUdn5I0tc2SMuHxirAcl2IdW2',
  EIA_SPR_SERIES: 'WCSSTUS1',
  EIA_API_BASE: 'https://api.eia.gov/v2/petroleum/stoc/wstk/data/',

  // Thresholds (million barrels)
  CAPACITY: 714,
  STRATEGIC_MINIMUM: 243,
  LEGAL_FLOOR: 150,
  COLLAPSE_THRESHOLD: 100,

  // Chart colors
  COLORS: {
    line: '#d4d4d4',
    lineFill: 'rgba(212, 212, 212, 0.03)',
    projection: '#f59e0b',
    strategicMin: '#f59e0b',
    legalFloor: '#ea580c',
    collapse: '#dc2626',
    dangerZone: 'rgba(220, 38, 38, 0.06)',
    annotation: 'rgba(245, 158, 11, 0.5)',
    annotationRed: 'rgba(220, 38, 38, 0.5)',
    gridLines: 'rgba(255, 255, 255, 0.04)',
    tickLabels: '#5a5a5a',
  }
};

// ---- Caching Helpers ----
const CACHE_KEYS = {
  SPR: 'oilcrisis_spr_cache',
  SPR_TIME: 'oilcrisis_spr_cache_time',
  PRICE: 'oilcrisis_price_cache',
  PRICE_TIME: 'oilcrisis_price_cache_time'
};

function getCachedData(key, expiryMs) {
  try {
    const dataStr = localStorage.getItem(key);
    const timeStr = localStorage.getItem(key + '_time');
    if (!dataStr || !timeStr) return null;

    const cacheTime = parseInt(timeStr, 10);
    const age = Date.now() - cacheTime;
    if (age > expiryMs) {
      return { expired: true, data: JSON.parse(dataStr) };
    }
    return { expired: false, data: JSON.parse(dataStr) };
  } catch (e) {
    console.warn('[Cache] Read failed for key:', key, e);
    return null;
  }
}

function setCachedData(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    localStorage.setItem(key + '_time', Date.now().toString());
  } catch (e) {
    console.warn('[Cache] Write failed for key:', key, e);
  }
}

// ---- Historical SPR Data (EIA-sourced, million barrels) ----
// This serves as fallback if the API fails, and provides pre-1982 data
// (EIA weekly API only goes back to 1982-08-20)
const HISTORICAL_DATA = [
  { date: '1977-10-01', level: 7.5 },
  { date: '1978-12-01', level: 68 },
  { date: '1980-06-01', level: 92 },
  { date: '1981-01-01', level: 230 },
  { date: '1982-12-01', level: 294 },
  { date: '1984-06-01', level: 431 },
  { date: '1985-12-01', level: 493 },
  { date: '1987-06-01', level: 533 },
  { date: '1988-12-01', level: 560 },
  { date: '1990-10-01', level: 590 },
  { date: '1991-03-01', level: 569 },
  { date: '1993-06-01', level: 585 },
  { date: '1994-12-01', level: 592 },
  { date: '1997-01-01', level: 563 },
  { date: '1999-06-01', level: 561 },
  { date: '2000-10-01', level: 543 },
  { date: '2002-12-01', level: 599 },
  { date: '2004-06-01', level: 662 },
  { date: '2005-08-01', level: 700 },
  { date: '2005-11-01', level: 685 },
  { date: '2007-01-01', level: 689 },
  { date: '2008-07-01', level: 707 },
  { date: '2009-12-27', level: 727 },
  { date: '2010-12-01', level: 727 },
  { date: '2011-09-01', level: 696 },
  { date: '2013-01-01', level: 695 },
  { date: '2014-06-01', level: 691 },
  { date: '2015-12-01', level: 695 },
  { date: '2017-01-01', level: 695 },
  { date: '2018-06-01', level: 660 },
  { date: '2019-06-01', level: 645 },
  { date: '2020-03-01', level: 635 },
  { date: '2020-12-01', level: 638 },
  { date: '2021-09-01', level: 621 },
  { date: '2022-02-01', level: 593 },
  { date: '2022-07-01', level: 480 },
  { date: '2022-12-01', level: 372 },
  { date: '2023-07-01', level: 347 },
  { date: '2023-12-01', level: 352 },
  { date: '2024-06-01', level: 373 },
  { date: '2024-12-01', level: 393 },
  { date: '2025-06-01', level: 402 },
  { date: '2025-12-01', level: 413 },
  { date: '2026-01-30', level: 415.2 },
  { date: '2026-02-27', level: 415.4 },
  { date: '2026-03-27', level: 415.0 },
  { date: '2026-04-03', level: 413.3 },
  { date: '2026-04-10', level: 409.2 },
  { date: '2026-04-17', level: 405.0 },
  { date: '2026-04-24', level: 397.9 },
  { date: '2026-05-01', level: 392.7 },
  { date: '2026-05-08', level: 384.1 },
  { date: '2026-05-15', level: 374.2 },
  { date: '2026-05-22', level: 365.1 },
  { date: '2026-05-29', level: 357.1 },
  { date: '2026-06-05', level: 349.2 },
  { date: '2026-06-12', level: 340.25 }
];

// ---- State ----
let sprChart = null;
let latestSPRLevel = null;
let latestSPRDate = null;

// ============================================================
// 1. BRENT CRUDE OIL PRICE (free proxy via multiple sources)
// ============================================================
async function fetchBrentPrice() {
  const loadingEl = document.getElementById('oil-price-loading');

  // Check cache first (5-minute expiry)
  const cached = getCachedData(CACHE_KEYS.PRICE, 5 * 60 * 1000);
  if (cached && !cached.expired) {
    console.log('[Price] Loaded from active cache:', cached.data);
    displayOilPrice(cached.data.price, cached.data.change, cached.data.source + ' (Cached)');
    return;
  }

  // Set timeout values (shortened to prevent page hanging)
  const YAHOO_TIMEOUT = 3500;
  const EIA_TIMEOUT = 4000;

  try {
    // Primary: Yahoo Finance Brent Futures (BZ=F) via AllOrigins CORS proxy
    const targetUrl = 'https://query1.finance.yahoo.com/v8/finance/chart/BZ=F?interval=1m&range=1d';
    const response = await fetch(
      `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
      { signal: AbortSignal.timeout(YAHOO_TIMEOUT) }
    );

    if (response.ok) {
      const data = await response.json();
      const result = data.chart?.result?.[0];
      if (result && result.meta) {
        const latest = result.meta.regularMarketPrice;
        const prev = result.meta.chartPreviousClose;
        const change = latest - prev;
        
        // Update cache
        const cacheData = { price: latest, change: change, source: 'Yahoo Finance' };
        setCachedData(CACHE_KEYS.PRICE, cacheData);

        displayOilPrice(latest, change, 'Yahoo Finance (Real-time)');
        return;
      }
    }
  } catch (e) {
    console.warn('Real-time Yahoo Finance fetch failed or timed out, trying EIA fallback...', e);
  }

  // Fallback: U.S. EIA API (updated daily, slightly lagged)
  try {
    const res = await fetch(
      `https://api.eia.gov/v2/petroleum/pri/spt/data/?api_key=${CONFIG.EIA_API_KEY}&frequency=daily&data[0]=value&facets[series][]=RBRTE&sort[0][column]=period&sort[0][direction]=desc&length=2`,
      { signal: AbortSignal.timeout(EIA_TIMEOUT) }
    );
    if (res.ok) {
      const data = await res.json();
      if (data.response?.data?.length >= 1) {
        const latest = parseFloat(data.response.data[0].value);
        const prev = data.response.data.length > 1 ? parseFloat(data.response.data[1].value) : latest;
        const change = latest - prev;

        // Update cache
        const cacheData = { price: latest, change: change, source: 'U.S. EIA' };
        setCachedData(CACHE_KEYS.PRICE, cacheData);

        displayOilPrice(latest, change, 'U.S. EIA (Daily spot)');
        return;
      }
    }
  } catch (e) {
    console.error('EIA fallback failed or timed out', e);
  }

  // Final fallback: check if we have any expired cached data
  if (cached && cached.data) {
    console.log('[Price] Fallback to expired cache:', cached.data);
    displayOilPrice(cached.data.price, cached.data.change, cached.data.source + ' (Stale Cache)');
    return;
  }

  // Final fallback: show that we couldn't load
  if (loadingEl) loadingEl.textContent = 'Price unavailable — check connection';
}

function displayOilPrice(price, change, source = 'Yahoo Finance') {
  const priceEl = document.getElementById('oil-price-value');
  const changeEl = document.getElementById('oil-price-change');
  const metaEl = document.getElementById('oil-price-meta');
  const loadingEl = document.getElementById('oil-price-loading');

  if (loadingEl) loadingEl.style.display = 'none';

  const currencyEl = document.getElementById('oil-price-currency');
  if (currencyEl) currencyEl.style.display = 'inline';

  if (priceEl) {
    priceEl.textContent = price.toFixed(2);
    priceEl.style.display = 'inline';
  }

  if (changeEl && change !== undefined) {
    const sign = change >= 0 ? '+' : '';
    const pct = ((change / (price - change)) * 100);
    changeEl.textContent = `${sign}${change.toFixed(2)} (${sign}${pct.toFixed(2)}%)`;
    changeEl.className = `oil-price-change ${change >= 0 ? 'up' : 'down'}`;
    changeEl.style.display = 'inline-block';
  }

  if (metaEl) {
    const now = new Date();
    metaEl.textContent = `Last fetched: ${now.toLocaleTimeString()} · Source: ${source}`;
  }
}

// ============================================================
// 2. EIA API — Fetch Live SPR Data
// ============================================================
async function fetchSPRData() {
  // Check cache first (12-hour expiry)
  const cached = getCachedData(CACHE_KEYS.SPR, 12 * 60 * 60 * 1000);
  if (cached && !cached.expired) {
    console.log('[SPR] Loaded from active cache. Latest date:', cached.data.latestDate);
    latestSPRLevel = cached.data.latestLevel;
    latestSPRDate = cached.data.latestDate;
    return cached.data.sampled;
  }

  const EIA_TIMEOUT = 7000; // Fast timeout for SPR data to prevent hanging

  try {
    // Fetch weekly SPR data — get last ~5000 records
    const url = `${CONFIG.EIA_API_BASE}?api_key=${CONFIG.EIA_API_KEY}`
      + `&frequency=weekly&data[0]=value`
      + `&facets[series][]=${CONFIG.EIA_SPR_SERIES}`
      + `&sort[0][column]=period&sort[0][direction]=asc`
      + `&length=5000`;

    const response = await fetch(url, { signal: AbortSignal.timeout(EIA_TIMEOUT) });

    if (!response.ok) throw new Error(`EIA API returned ${response.status}`);

    const json = await response.json();
    const records = json.response?.data;

    if (!records || records.length === 0) {
      throw new Error('No SPR data returned from EIA API');
    }

    // Convert to our format (values come as thousands of barrels)
    const liveData = records.map(r => ({
      date: r.period,
      level: parseFloat(r.value) / 1000 // Convert thousands → millions
    })).filter(d => !isNaN(d.level));

    // Merge with pre-1982 historical data
    const cutoffDate = liveData[0]?.date || '1982-08-20';
    const preHistory = HISTORICAL_DATA.filter(d => d.date < cutoffDate);
    const fullData = [...preHistory, ...liveData];

    // Sort chronologically
    fullData.sort((a, b) => a.date.localeCompare(b.date));

    // Update latest values
    const latest = fullData[fullData.length - 1];
    latestSPRLevel = latest.level;
    latestSPRDate = latest.date;

    console.log(`[SPR] Loaded ${fullData.length} data points. Latest: ${latestSPRLevel.toFixed(1)}M bbl on ${latestSPRDate}`);

    // Downsample for chart performance (keep ~200 points + all points from 2020+)
    const sampled = downsampleData(fullData, 200);

    // Save to cache
    const cacheData = {
      sampled: sampled,
      latestLevel: latestSPRLevel,
      latestDate: latestSPRDate
    };
    setCachedData(CACHE_KEYS.SPR, cacheData);

    return sampled;

  } catch (error) {
    console.error('[SPR] EIA API fetch failed or timed out:', error);

    // Fallback to expired cache if available
    if (cached && cached.data) {
      console.log('[SPR] Fallback to expired cache. Latest date:', cached.data.latestDate);
      latestSPRLevel = cached.data.latestLevel;
      latestSPRDate = cached.data.latestDate;
      return cached.data.sampled;
    }

    // Sort fallback just in case
    HISTORICAL_DATA.sort((a, b) => a.date.localeCompare(b.date));

    // Use hardcoded fallback
    latestSPRLevel = HISTORICAL_DATA[HISTORICAL_DATA.length - 1].level;
    latestSPRDate = HISTORICAL_DATA[HISTORICAL_DATA.length - 1].date;
    return HISTORICAL_DATA;
  }
}

function downsampleData(data, targetCount) {
  if (data.length <= targetCount) return data;

  // Keep all data from 2020 onward at full resolution
  const recentCutoff = '2020-01-01';
  const recent = data.filter(d => d.date >= recentCutoff);
  const older = data.filter(d => d.date < recentCutoff);

  // Sample older data
  const olderTarget = Math.max(targetCount - recent.length, 50);
  const step = Math.ceil(older.length / olderTarget);
  const sampledOlder = older.filter((_, i) => i % step === 0 || i === older.length - 1);

  // Also keep peak and other key points
  const peak = older.reduce((max, d) => d.level > max.level ? d : max, older[0]);
  if (!sampledOlder.find(d => d.date === peak.date)) {
    sampledOlder.push(peak);
    sampledOlder.sort((a, b) => a.date.localeCompare(b.date));
  }

  return [...sampledOlder, ...recent];
}

// ============================================================
// 3. PROJECTION LINE — Extend to Collapse Floor
// ============================================================
function formatLocalDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function generateProjection(data) {
  // Use last 5 weeks of data for regression (active crisis window)
  const recentData = data.slice(-5); // 5 points = 4 weeks of data
  if (recentData.length < 2) return [];

  // Simple linear regression
  const n = recentData.length;
  const startTime = new Date(recentData[0].date + 'T00:00:00').getTime();
  const xs = recentData.map(d => (new Date(d.date + 'T00:00:00').getTime() - startTime) / (1000 * 60 * 60 * 24)); // days from start
  const ys = recentData.map(d => d.level);

  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((sum, x, i) => sum + x * ys[i], 0);
  const sumX2 = xs.reduce((sum, x) => sum + x * x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // If slope is positive (refilling), still show the projection but it won't hit collapse
  const lastDate = new Date(recentData[recentData.length - 1].date + 'T00:00:00');
  const lastDayOffset = xs[xs.length - 1];

  const projectionPoints = [];
  const maxDays = 365 * 5; // Project up to 5 years max

  for (let dayOffset = 0; dayOffset <= maxDays; dayOffset += 14) { // bi-weekly points
    const projectedLevel = intercept + slope * (lastDayOffset + dayOffset);

    // Stop if we hit the collapse floor
    if (projectedLevel <= CONFIG.COLLAPSE_THRESHOLD) {
      // Add the exact intersection point
      const daysToCollapse = (CONFIG.COLLAPSE_THRESHOLD - intercept - slope * lastDayOffset) / slope;
      const collapseDate = new Date(lastDate.getTime() + daysToCollapse * 24 * 60 * 60 * 1000);
      projectionPoints.push({
        date: formatLocalDate(collapseDate),
        level: CONFIG.COLLAPSE_THRESHOLD
      });
      break;
    }

    // Stop if level goes above capacity (nonsensical)
    if (projectedLevel > CONFIG.CAPACITY + 50) break;

    const projDate = new Date(lastDate.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    projectionPoints.push({
      date: formatLocalDate(projDate),
      level: Math.max(0, projectedLevel)
    });
  }

  return projectionPoints;
}

function calculateMilestones(data) {
  // Use last 5 weeks of data for regression (active crisis window)
  const recentData = data.slice(-5); // 5 points = 4 weeks of data
  if (recentData.length < 2) return null;

  // Simple linear regression
  const n = recentData.length;
  const startTime = new Date(recentData[0].date + 'T00:00:00').getTime();
  const xs = recentData.map(d => (new Date(d.date + 'T00:00:00').getTime() - startTime) / (1000 * 60 * 60 * 24)); // days from start
  const ys = recentData.map(d => d.level);

  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((sum, x, i) => sum + x * ys[i], 0);
  const sumX2 = xs.reduce((sum, x) => sum + x * x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // If slope is positive (stable/refilling), no future milestone dates can be calculated
  if (slope >= 0) return null;

  const lastDateObj = new Date(recentData[recentData.length - 1].date + 'T00:00:00');
  const lastDayOffset = xs[xs.length - 1];

  const getMilestoneDate = (target) => {
    // target = intercept + slope * (lastDayOffset + daysFromLast)
    // daysFromLast = (target - intercept - slope * lastDayOffset) / slope
    const daysFromLast = (target - intercept - slope * lastDayOffset) / slope;
    return new Date(lastDateObj.getTime() + daysFromLast * 24 * 60 * 60 * 1000);
  };

  return {
    strategic: getMilestoneDate(CONFIG.STRATEGIC_MINIMUM),
    legal: getMilestoneDate(CONFIG.LEGAL_FLOOR),
    collapse: getMilestoneDate(CONFIG.COLLAPSE_THRESHOLD)
  };
}

// ============================================================
// 4. CHART.JS — Render Interactive Chart
// ============================================================
function renderChart(historicalData, projectionData, milestones) {
  const ctx = document.getElementById('spr-chart');
  if (!ctx) return;

  // Prepare datasets using Date objects for time scale x-values
  const sprPoints = historicalData.map(d => ({ x: new Date(d.date + 'T00:00:00'), y: d.level }));
  
  // Projection overlaps the last historical point for continuity
  const lastHistPoint = historicalData[historicalData.length - 1];
  const projPoints = [
    { x: new Date(lastHistPoint.date + 'T00:00:00'), y: lastHistPoint.level },
    ...projectionData.map(d => ({ x: new Date(d.date + 'T00:00:00'), y: d.level }))
  ];

  const firstHistDateObj = new Date(historicalData[0].date + 'T00:00:00');
  const lastProjPoint = projectionData[projectionData.length - 1] || lastHistPoint;
  const lastProjDateObj = new Date(lastProjPoint.date + 'T00:00:00');
  
  // Extend threshold lines to a far future date for consistent clipping
  const futureDateObj = new Date('2030-12-31T00:00:00');

  // Threshold lines as two-point horizontal lines
  const strategicLine = [
    { x: firstHistDateObj, y: CONFIG.STRATEGIC_MINIMUM },
    { x: futureDateObj, y: CONFIG.STRATEGIC_MINIMUM }
  ];
  const legalLine = [
    { x: firstHistDateObj, y: CONFIG.LEGAL_FLOOR },
    { x: futureDateObj, y: CONFIG.LEGAL_FLOOR }
  ];
  const collapseLine = [
    { x: firstHistDateObj, y: CONFIG.COLLAPSE_THRESHOLD },
    { x: futureDateObj, y: CONFIG.COLLAPSE_THRESHOLD }
  ];
  const dangerZoneLine = [
    { x: firstHistDateObj, y: CONFIG.LEGAL_FLOOR },
    { x: futureDateObj, y: CONFIG.LEGAL_FLOOR }
  ];

  // Milestones points array
  const milestonePoints = [];
  if (milestones) {
    milestonePoints.push({ x: milestones.strategic, y: CONFIG.STRATEGIC_MINIMUM });
    milestonePoints.push({ x: milestones.legal, y: CONFIG.LEGAL_FLOOR });
    milestonePoints.push({ x: milestones.collapse, y: CONFIG.COLLAPSE_THRESHOLD });
  }

  // Destroy existing chart
  if (sprChart) {
    sprChart.destroy();
  }

  sprChart = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        // Danger zone fill (between legal floor and collapse)
        {
          label: 'Danger Zone',
          data: dangerZoneLine,
          fill: {
            target: { value: CONFIG.COLLAPSE_THRESHOLD },
            above: CONFIG.COLORS.dangerZone,
          },
          borderColor: 'transparent',
          pointRadius: 0,
          pointHitRadius: 0,
          order: 10,
        },
        // Historical SPR level
        {
          label: 'SPR Level',
          data: sprPoints,
          borderColor: CONFIG.COLORS.line,
          backgroundColor: CONFIG.COLORS.lineFill,
          borderWidth: 2,
          fill: true,
          tension: 0.15,
          pointRadius: 0,
          pointHitRadius: 8,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderColor: '#ffffff',
          order: 1,
        },
        // Projection (disabled hover/hit interaction for intermediate points)
        {
          label: 'Projected Trajectory',
          data: projPoints,
          borderColor: CONFIG.COLORS.projection,
          borderWidth: 2,
          borderDash: [8, 6],
          fill: false,
          tension: 0,
          pointRadius: 0,
          pointHitRadius: 0,
          pointHoverRadius: 0,
          order: 2,
        },
        // Strategic Minimum
        {
          label: 'Strategic Minimum (243M)',
          data: strategicLine,
          borderColor: CONFIG.COLORS.strategicMin,
          borderWidth: 1.5,
          borderDash: [10, 5],
          fill: false,
          pointRadius: 0,
          pointHitRadius: 0,
          order: 5,
        },
        // Legal Floor
        {
          label: 'Legal Floor — EPCA (150M)',
          data: legalLine,
          borderColor: CONFIG.COLORS.legalFloor,
          borderWidth: 1.5,
          fill: false,
          pointRadius: 0,
          pointHitRadius: 0,
          order: 6,
        },
        // Collapse Threshold
        {
          label: 'Cavern Collapse (~100M)',
          data: collapseLine,
          borderColor: CONFIG.COLORS.collapse,
          borderWidth: 2.5,
          fill: false,
          pointRadius: 0,
          pointHitRadius: 0,
          order: 7,
        },
        // Key Breach Milestones (only hoverable points on the projection line)
        {
          label: 'Critical Milestones',
          data: milestonePoints,
          pointBackgroundColor: [CONFIG.COLORS.strategicMin, CONFIG.COLORS.legalFloor, CONFIG.COLORS.collapse],
          pointBorderColor: ['#ffffff', '#ffffff', '#ffffff'],
          pointBorderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 9,
          pointHitRadius: 10,
          showLine: false,
          order: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'nearest',
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#111111',
          titleColor: '#e0e0e0',
          bodyColor: '#d4d4d4',
          borderColor: '#2a2a2a',
          borderWidth: 1,
          padding: 12,
          titleFont: { family: "'Inter', sans-serif", size: 12, weight: 600 },
          bodyFont: { family: "'JetBrains Mono', monospace", size: 12 },
          displayColors: true,
          callbacks: {
            title: function(items) {
              if (!items.length) return '';
              const date = new Date(items[0].parsed.x);
              return date.toLocaleDateString('en-US', {
                year: 'numeric', month: 'long', day: 'numeric'
              });
            },
            label: function(context) {
              if (context.raw === null || context.raw === undefined) return null;
              const dsLabel = context.dataset.label;
              if (dsLabel === 'Danger Zone') return null;

              if (dsLabel === 'Critical Milestones') {
                const item = context.raw;
                const date = new Date(context.parsed.x);
                const dateStr = date.toLocaleDateString('en-US', {
                  year: 'numeric', month: 'long', day: 'numeric'
                });
                if (item.y === CONFIG.STRATEGIC_MINIMUM) {
                  return ` Strategic Minimum Breach: ${dateStr} (243M bbl)`;
                } else if (item.y === CONFIG.LEGAL_FLOOR) {
                  return ` Legal Floor Breach: ${dateStr} (150M bbl)`;
                } else if (item.y === CONFIG.COLLAPSE_THRESHOLD) {
                  return ` Permanent Cavern Collapse 💀: ${dateStr} (100M bbl)`;
                }
              }

              const value = context.raw.y.toFixed(1);
              return ` ${dsLabel}: ${value}M barrels`;
            },
          },
          filter: function(tooltipItem) {
            return tooltipItem.raw !== null && tooltipItem.dataset.label !== 'Danger Zone';
          }
        },
        annotation: {
          annotations: {
            // March 2022 vertical line
            mar2022Line: {
              type: 'line',
              xMin: new Date('2022-03-11T00:00:00'),
              xMax: new Date('2022-03-11T00:00:00'),
              borderColor: CONFIG.COLORS.annotation,
              borderWidth: 1,
              borderDash: [6, 4],
              label: {
                display: true,
                content: 'MAR 2022 — 180M BBL RELEASE',
                position: 'start',
                backgroundColor: 'rgba(17, 17, 17, 0.9)',
                color: '#f59e0b',
                font: { family: "'JetBrains Mono', monospace", size: 9, weight: 600 },
                padding: { x: 6, y: 4 },
                borderRadius: 4,
                rotation: -90,
                yAdjust: -20,
              }
            },
            // March 2026 vertical line
            mar2026Line: {
              type: 'line',
              xMin: new Date('2026-03-01T00:00:00'),
              xMax: new Date('2026-03-01T00:00:00'),
              borderColor: CONFIG.COLORS.annotationRed,
              borderWidth: 1,
              borderDash: [6, 4],
              label: {
                display: true,
                content: 'MAR 2026 — 172M BBL RELEASE',
                position: 'start',
                backgroundColor: 'rgba(17, 17, 17, 0.9)',
                color: '#dc2626',
                font: { family: "'JetBrains Mono', monospace", size: 9, weight: 600 },
                padding: { x: 6, y: 4 },
                borderRadius: 4,
                rotation: -90,
                yAdjust: -20,
              }
            },
            // Threshold labels on right side
            strategicLabel: {
              type: 'label',
              xValue: lastProjDateObj,
              yValue: CONFIG.STRATEGIC_MINIMUM,
              content: ['STRATEGIC', 'MINIMUM'],
              color: CONFIG.COLORS.strategicMin,
              font: { family: "'JetBrains Mono', monospace", size: 8, weight: 600 },
              position: { x: 'end' },
              xAdjust: -8,
              yAdjust: -16,
              textAlign: 'right',
            },
            legalLabel: {
              type: 'label',
              xValue: lastProjDateObj,
              yValue: CONFIG.LEGAL_FLOOR,
              content: ['LEGAL FLOOR', '(EPCA)'],
              color: CONFIG.COLORS.legalFloor,
              font: { family: "'JetBrains Mono', monospace", size: 8, weight: 600 },
              position: { x: 'end' },
              xAdjust: -8,
              yAdjust: -16,
              textAlign: 'right',
            },
            collapseLabel: {
              type: 'label',
              xValue: lastProjDateObj,
              yValue: CONFIG.COLLAPSE_THRESHOLD,
              content: ['⚠ CAVERN', 'COLLAPSE'],
              color: CONFIG.COLORS.collapse,
              font: { family: "'JetBrains Mono', monospace", size: 8, weight: 700 },
              position: { x: 'end' },
              xAdjust: -8,
              yAdjust: -16,
              textAlign: 'right',
            },
          }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: 'year',
            displayFormats: {
              year: 'yyyy',
              month: 'MMM yyyy',
              day: 'MMM dd'
            }
          },
          grid: {
            color: CONFIG.COLORS.gridLines,
            lineWidth: 0.5,
          },
          ticks: {
            color: CONFIG.COLORS.tickLabels,
            font: { family: "'JetBrains Mono', monospace", size: 10 },
            autoSkip: true,
            maxTicksLimit: 12,
          },
          border: { color: 'rgba(255,255,255,0.06)' }
        },
        y: {
          min: 0,
          max: 800,
          grid: {
            color: CONFIG.COLORS.gridLines,
            lineWidth: 0.5,
          },
          ticks: {
            color: CONFIG.COLORS.tickLabels,
            font: { family: "'JetBrains Mono', monospace", size: 10 },
            stepSize: 100,
            callback: function(value) {
              return value + 'M';
            }
          },
          border: { color: 'rgba(255,255,255,0.06)' },
          title: {
            display: true,
            text: 'Million Barrels',
            color: '#3a3a3a',
            font: { family: "'Inter', sans-serif", size: 11, weight: 500 },
            padding: { bottom: 8 }
          }
        }
      },
      elements: {
        line: {
          capBezierPoints: true
        }
      },
    }
  });

  // Initialize display range to 10 years by default
  updateChartTimeframe('10y');
}

// ============================================================
// 4b. TIMEFRAME SELECTOR CONTROLS
// ============================================================
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function updateChartTimeframe(range) {
  if (!sprChart) return;

  const latestDate = new Date(latestSPRDate + 'T00:00:00');
  let minDate = null;

  switch (range) {
    case '10y':
      minDate = new Date(latestDate.getTime() - 10 * 365.25 * 24 * 60 * 60 * 1000);
      break;
    case '5y':
      minDate = new Date(latestDate.getTime() - 5 * 365.25 * 24 * 60 * 60 * 1000);
      break;
    case '1y':
      minDate = new Date(latestDate.getTime() - 365.25 * 24 * 60 * 60 * 1000);
      break;
    case 'max':
    default:
      minDate = new Date('1977-01-01T00:00:00');
      break;
  }

  // Adjust time unit ticks spacing for readability based on range
  if (range === 'max') {
    sprChart.options.scales.x.time.unit = 'year';
  } else if (range === '10y' || range === '5y') {
    sprChart.options.scales.x.time.unit = 'year';
  } else if (range === '1y') {
    sprChart.options.scales.x.time.unit = 'month';
  }

  // Get last projection point date
  const datasets = sprChart.data.datasets;
  const projData = datasets[2].data;
  const lastPoint = projData[projData.length - 1];
  const projEndDate = lastPoint ? new Date(lastPoint.x) : latestDate;

  let maxDate = null;
  switch (range) {
    case 'max':
      maxDate = addDays(projEndDate, 90);
      break;
    case '10y':
      maxDate = addDays(projEndDate, 90);
      break;
    case '5y':
      maxDate = addDays(projEndDate, 60);
      break;
    case '1y':
      maxDate = addDays(projEndDate, 30);
      break;
    default:
      maxDate = projEndDate;
      break;
  }

  // Update scale limits
  sprChart.options.scales.x.min = minDate;
  sprChart.options.scales.x.max = maxDate;

  // Show vertical annotations only on zoomed-in views (10y, 5y, 1y) to prevent text overlaps on the Max view
  const showAnnotations = (range !== 'max');
  if (sprChart.options.plugins.annotation.annotations.mar2022Line) {
    sprChart.options.plugins.annotation.annotations.mar2022Line.display = showAnnotations;
  }
  if (sprChart.options.plugins.annotation.annotations.mar2026Line) {
    sprChart.options.plugins.annotation.annotations.mar2026Line.display = showAnnotations;
  }

  // Adjust threshold label positions
  const lastProjDateObj = lastPoint ? lastPoint.x : latestDate;
  
  if (sprChart.options.plugins.annotation.annotations.strategicLabel) {
    sprChart.options.plugins.annotation.annotations.strategicLabel.xValue = lastProjDateObj;
    sprChart.options.plugins.annotation.annotations.legalLabel.xValue = lastProjDateObj;
    sprChart.options.plugins.annotation.annotations.collapseLabel.xValue = lastProjDateObj;
  }

  sprChart.update();
}

function initTimeframeSelectors() {
  const buttons = document.querySelectorAll('.timeframe-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const range = btn.getAttribute('data-range');
      updateChartTimeframe(range);
    });
  });
}

// ============================================================
// 5. GAUGE ANIMATION
// ============================================================
function initGauge(level, capacity) {
  const percentage = (level / capacity) * 100;
  const gaugeCurrentEl = document.getElementById('gauge-current-value');
  const gaugeBarEl = document.getElementById('gauge-bar-fill');
  const gaugePercentEl = document.getElementById('gauge-percentage');
  const gaugeDateEl = document.getElementById('gauge-date');

  if (gaugeCurrentEl) {
    gaugeCurrentEl.setAttribute('data-target', level.toFixed(1));
  }

  if (gaugePercentEl) {
    gaugePercentEl.textContent = `${percentage.toFixed(1)}% of capacity`;
    gaugePercentEl.className = `gauge-percentage ${percentage < 40 ? 'critical' : 'warning'}`;
  }

  if (gaugeDateEl && latestSPRDate) {
    const d = new Date(latestSPRDate + 'T00:00:00');
    gaugeDateEl.textContent = `As of ${d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} · Source: U.S. EIA`;
  }

  // Intersection observer for animation
  const gaugeSection = document.querySelector('.gauge-section');
  if (!gaugeSection) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateGauge(level, percentage);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });

  observer.observe(gaugeSection);
}

function animateGauge(targetLevel, targetPercentage) {
  const gaugeCurrentEl = document.getElementById('gauge-current-value');
  const gaugeBarEl = document.getElementById('gauge-bar-fill');

  // Animate counter
  if (gaugeCurrentEl) {
    animateCounter(gaugeCurrentEl, 0, targetLevel, 2000);
  }

  // Animate bar fill
  if (gaugeBarEl) {
    requestAnimationFrame(() => {
      gaugeBarEl.style.width = `${targetPercentage}%`;
    });
  }
}

function animateCounter(el, start, end, duration) {
  const startTime = performance.now();
  const decimals = end < 10 ? 2 : 1;

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = start + (end - start) * eased;

    el.textContent = current.toFixed(decimals);

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

// ============================================================
// 6. SCROLL REVEAL ANIMATIONS
// ============================================================
function initScrollReveal() {
  const reveals = document.querySelectorAll('.reveal');
  if (!reveals.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.08,
    rootMargin: '0px 0px -40px 0px'
  });

  reveals.forEach(el => observer.observe(el));
}

// ============================================================
// 7. COUNTDOWN TO STRATEGIC MINIMUM
// ============================================================
function initCountdown(sprData) {
  const countdownEl = document.getElementById('countdown-value');
  const countdownSubEl = document.getElementById('countdown-sub');
  const countdownRateEl = document.getElementById('countdown-rate');

  if (!countdownEl) return;

  const currentLevel = latestSPRLevel || sprData[sprData.length - 1].level;
  const target = CONFIG.STRATEGIC_MINIMUM;

  // If already below strategic minimum
  if (currentLevel <= target) {
    countdownEl.innerHTML = '<span class="countdown-number">NOW</span>';
    if (countdownSubEl) countdownSubEl.textContent = 'The SPR is already below the strategic minimum.';
    return;
  }

  // Calculate drawdown rate from recent active crisis window (last 5 weeks)
  const recentData = sprData.slice(-5); // 5 points = 4 weeks of data
  if (recentData.length < 2) return;

  const firstPoint = recentData[0];
  const lastPoint = recentData[recentData.length - 1];
  const daysBetween = (new Date(lastPoint.date) - new Date(firstPoint.date)) / (1000 * 60 * 60 * 24);
  const levelDrop = firstPoint.level - lastPoint.level;

  if (levelDrop <= 0 || daysBetween <= 0) {
    // SPR is being refilled or stable
    countdownEl.innerHTML = '<span class="countdown-stable">STABLE</span>';
    if (countdownSubEl) countdownSubEl.textContent = 'The reserve is currently being refilled or stable.';
    const targetDateEl = document.getElementById('countdown-target-date');
    if (targetDateEl) {
      targetDateEl.innerHTML = `Estimated Breach Date: <strong class="amber-glow">N/A (Stable)</strong>`;
    }
    return;
  }

  const dailyRate = levelDrop / daysBetween; // M barrels per day
  const weeklyRate = dailyRate * 7;
  const remaining = currentLevel - target;
  const daysToTarget = remaining / dailyRate;

  // Calculate estimated breach date
  const lastDataDate = new Date(lastPoint.date + 'T00:00:00');
  const targetDate = new Date(lastDataDate.getTime() + daysToTarget * 24 * 60 * 60 * 1000);
  const dateString = targetDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const targetDateEl = document.getElementById('countdown-target-date');
  if (targetDateEl) {
    targetDateEl.innerHTML = `Estimated Breach Date: <strong class="amber-glow">${dateString}</strong>`;
  }

  const months = Math.floor(daysToTarget / 30.44);
  const days = Math.floor(daysToTarget % 30.44);
  const weeks = Math.floor(daysToTarget / 7);

  // Build display
  let countdownHTML = '';
  if (months > 0) {
    countdownHTML += `<div class="countdown-item"><span class="countdown-number">${months}</span><span class="countdown-unit">${months === 1 ? 'MONTH' : 'MONTHS'}</span></div>`;
    countdownHTML += `<span class="countdown-separator">&</span>`;
    countdownHTML += `<div class="countdown-item"><span class="countdown-number">${days}</span><span class="countdown-unit">${days === 1 ? 'DAY' : 'DAYS'}</span></div>`;
  } else {
    countdownHTML += `<div class="countdown-item"><span class="countdown-number">${days}</span><span class="countdown-unit">${days === 1 ? 'DAY' : 'DAYS'}</span></div>`;
  }

  countdownEl.innerHTML = countdownHTML;

  if (countdownSubEl) {
    countdownSubEl.textContent = `until the SPR reaches the Strategic Minimum of ${target}M barrels`;
  }

  if (countdownRateEl) {
    countdownRateEl.textContent = `Current acute drawdown: ~${weeklyRate.toFixed(1)}M barrels/week · ${(dailyRate * 30.44).toFixed(1)}M barrels/month`;
  }

  // Animate the numbers in
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });

  const section = document.querySelector('.countdown-section');
  if (section) observer.observe(section);
}

// ============================================================
// 8. INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[OilCrisis.us] Initializing dashboard...');

  // Start loading data in parallel
  const [sprData] = await Promise.all([
    fetchSPRData(),
    fetchBrentPrice(),
  ]);

  // Generate projection from historical data
  const projection = generateProjection(sprData);

  // Calculate milestones
  const milestones = calculateMilestones(sprData);

  // Render chart
  renderChart(sprData, projection, milestones);

  // Initialize chart timeframe selectors
  initTimeframeSelectors();

  // Initialize gauge with latest data
  const level = latestSPRLevel || sprData[sprData.length - 1].level;
  initGauge(level, CONFIG.CAPACITY);

  // Initialize countdown
  initCountdown(sprData);

  // Initialize 3D cavern (oil fills from top, so oil% = current level / capacity)
  const oilPercent = (level / CONFIG.CAPACITY) * 100;
  if (typeof initCavern === 'function') {
    // Wait for cavern container to be visible for correct sizing
    const cavernContainer = document.getElementById('cavern-3d');
    if (cavernContainer) {
      const cavernObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          initCavern(oilPercent);
          cavernObserver.unobserve(entries[0].target);
        }
      }, { threshold: 0.1 });
      cavernObserver.observe(cavernContainer);
    }
  }

  // Initialize scroll reveal animations
  initScrollReveal();

  // Update the live data indicator
  const dataNote = document.getElementById('chart-data-note');
  if (dataNote && latestSPRDate) {
    const d = new Date(latestSPRDate + 'T00:00:00');
    dataNote.textContent = `Live data from U.S. EIA · Updated weekly · Latest: ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }

  console.log('[OilCrisis.us] Dashboard initialized.');
});
