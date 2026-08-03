/* ============================================================
   The Great Basin Loop
   Route map, scroll choreography, reveals.
   ============================================================ */

(function () {
  'use strict';

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- one rAF loop drives everything ------------------
     Declared first: the map and parallax both register into it.
     Nothing reads layout inside the scroll handler — offsets are
     measured once and compared against scrollY, which is free.
  ----------------------------------------------------------- */

  const painters = [], measurers = [];
  let queued = false;

  function register (paint, measure) {
    painters.push(paint);
    if (measure) measurers.push(measure);
  }

  function frame () {
    queued = false;
    for (const p of painters) p();
  }

  function onScroll () {
    if (!queued) { queued = true; requestAnimationFrame(frame); }
  }

  function remeasure () {
    for (const m of measurers) m();
    onScroll();
  }

  /* ---------- projection ------------------------------------
     Equirectangular with a cos(phi0) correction at 40.5N.
     Every pin and every state outline goes through this one
     function, so they cannot disagree with each other.
  ----------------------------------------------------------- */

  const LON_MIN = -125, LON_MAX = -104;
  const LAT_MIN = 33,   LAT_MAX = 47;
  const K = Math.cos(40.5 * Math.PI / 180);          // 0.760406
  const SCALE = 1000 / ((LON_MAX - LON_MIN) * K);    // 62.623
  const VB_W = 1000;
  const VB_H = +((LAT_MAX - LAT_MIN) * SCALE).toFixed(1);   // 876.7

  const px = lon => (lon - LON_MIN) * K * SCALE;
  const py = lat => (LAT_MAX - lat) * SCALE;
  const project = ([lon, lat]) => [px(lon), py(lat)];

  /* ---------- geography -------------------------------------
     Western state borders are overwhelmingly meridians and
     parallels, so short polygons are exact, not approximate.
     Wyoming really is four points.
  ----------------------------------------------------------- */

  const STATES = {
    wy: [[-111.05,45],[-104.05,45],[-104.05,41],[-111.05,41]],
    ut: [[-114.05,42],[-111.05,42],[-111.05,41],[-109.05,41],[-109.05,37],[-114.05,37]],
    nv: [[-120,42],[-114.05,42],[-114.05,36.19],[-114.63,35],[-120,39]],
    ca: [[-124.21,41.99],[-120,41.99],[-120,39],[-114.63,35],[-114.72,34.87],[-114.63,34.5],
         [-114.14,34.3],[-114.44,34.08],[-114.53,33.03],[-114.72,32.72],[-117.13,32.53],
         [-117.32,33.12],[-118.14,33.75],[-118.52,34.03],[-119.27,34.27],[-120.47,34.45],
         [-120.64,35.13],[-121.28,35.67],[-121.9,36.31],[-121.79,36.8],[-122.42,37.78],
         [-122.53,37.99],[-123.01,38.3],[-123.72,38.91],[-124.1,39.77],[-124.41,40.44]],
    id: [[-117.03,42],[-111.05,42],[-111.05,44.48],[-112.65,44.48],[-113.45,45.6],
         [-114.35,46.6],[-114.6,47],[-116.05,47],[-116.05,45.62],[-116.93,45.62],
         [-116.46,44.85],[-117.22,44.3],[-117.03,43.6]],
    or: [[-124.55,42],[-117.03,42],[-117.03,43.6],[-117.22,44.3],[-116.46,44.85],
         [-116.93,45.62],[-118.98,46],[-119.6,45.92],[-120.66,45.73],[-121.2,45.66],
         [-122.24,45.55],[-122.76,45.65],[-123.12,46.17],[-123.96,46.24],[-124.08,45],
         [-124.55,43]],
    az: [[-114.05,37],[-109.05,37],[-109.05,31.33],[-111.07,31.33],[-114.82,32.49],
         [-114.72,32.72],[-114.53,33.03],[-114.44,34.08],[-114.14,34.3],[-114.63,34.5],
         [-114.72,34.87],[-114.63,35],[-114.05,36.19]],
    co: [[-109.05,41],[-102.05,41],[-102.05,37],[-109.05,37]],
    mt: [[-114.6,47],[-104.05,47],[-104.05,45],[-111.05,45],[-111.05,44.48],
         [-112.65,44.48],[-113.45,45.6],[-114.35,46.6]]
  };
  const MINOR = ['or', 'az', 'co', 'mt'];

  /* Waypoints, in travel order. SF appears at both ends. */
  const WAYPOINTS = [
    [-122.4194, 37.7749],   // San Francisco
    [-119.5936, 37.7456],   // Yosemite Valley
    [-113.8500, 40.7500],   // Bonneville Salt Flats
    [-110.7624, 43.4799],   // Jackson Hole
    [-110.8281, 44.4605],   // Yellowstone, Old Faithful
    [-115.4739, 40.6086],   // Ruby Mountains
    [-120.0324, 39.0968],   // Lake Tahoe
    [-122.4194, 37.7749]    // back to SF
  ];

  const NS = 'http://www.w3.org/2000/svg';
  const el = (n, attrs) => {
    const e = document.createElementNS(NS, n);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };

  /* ---------- route geometry --------------------------------
     One continuous subpath. Seven separate M commands would
     restart the dash pattern and draw all legs at once.
  ----------------------------------------------------------- */

  function buildRoute (pts) {
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const legs = [];
    let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      let nx = -dy / len, ny = dx / len;

      // bow the arc away from the centre of the loop
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      if ((mx - cx) * nx + (my - cy) * ny < 0) { nx = -nx; ny = -ny; }
      const bow = len * 0.15;

      const c1 = [a[0] + dx / 3 + nx * bow, a[1] + dy / 3 + ny * bow];
      const c2 = [a[0] + dx * 2 / 3 + nx * bow, a[1] + dy * 2 / 3 + ny * bow];
      d += ` C ${c1[0].toFixed(2)} ${c1[1].toFixed(2)}, ${c2[0].toFixed(2)} ${c2[1].toFixed(2)}, ${b[0].toFixed(2)} ${b[1].toFixed(2)}`;
      legs.push([a, c1, c2, b]);
    }
    return { d, legs };   // no Z — it would add a zero-length closing segment
  }

  /* Analytic flattening. Avoids getTotalLength(), which returns 0
     on non-rendered elements in WebKit and differs between engines. */
  function cubicLength (p0, p1, p2, p3, steps) {
    let last = p0, total = 0;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, u = 1 - t;
      const x = u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0];
      const y = u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1];
      total += Math.hypot(x - last[0], y - last[1]);
      last = [x, y];
    }
    return total;
  }

  /* ---------- build the map ---------------------------------- */

  const mapEl = document.getElementById('map');
  let legT = null;   // cumulative arc-length fraction at each waypoint

  if (mapEl) {
    const canvas = mapEl.querySelector('.map__canvas');
    const svg = el('svg', {
      viewBox: `0 0 ${VB_W} ${VB_H}`,
      preserveAspectRatio: 'xMidYMid meet',
      'aria-hidden': 'true',
      focusable: 'false'
    });

    for (const key in STATES) {
      const pts = STATES[key].map(project);
      svg.appendChild(el('path', {
        d: 'M' + pts.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L ') + ' Z',
        class: 'st' + (MINOR.includes(key) ? ' st--minor' : '')
      }));
    }

    const proj = WAYPOINTS.map(project);
    const { d, legs } = buildRoute(proj);

    // arc-length fraction of each waypoint along the whole route
    const lens = legs.map(l => cubicLength(l[0], l[1], l[2], l[3], 16));
    const total = lens.reduce((a, b) => a + b, 0);
    legT = [0];
    lens.reduce((acc, l) => { const n = acc + l; legT.push(n / total); return n; }, 0);

    // four passes over the same geometry, all sharing --t
    ['route-ghost', 'route-glow', 'route-live', 'route-head'].forEach(cls => {
      svg.appendChild(el('path', { d: d, class: cls, pathLength: '1' }));
    });

    canvas.appendChild(svg);

    // pins are real HTML anchors laid over the svg: focusable,
    // 44px+ tap targets, readable by screen readers
    const pins = [...mapEl.querySelectorAll('.pin')];
    pins.forEach(pin => {
      const [x, y] = project([+pin.dataset.lon, +pin.dataset.lat]);
      pin.style.setProperty('--x', (x / VB_W).toFixed(5));
      pin.style.setProperty('--y', (y / VB_H).toFixed(5));
    });
    mapEl.querySelector('.map__pins').classList.add('is-ready');

    /* ---------- scroll scrub ---------------------------------- */

    const grid = document.querySelector('.route__grid');
    const sticky = document.querySelector('.route__sticky');
    const svgRoot = svg;
    let start = 0, span = 1, reached = -1;

    function measureMap () {
      const r = grid.getBoundingClientRect();
      start = r.top + window.scrollY;
      span = Math.max(1, r.height - sticky.getBoundingClientRect().height);
    }

    function paintMap () {
      const s = Math.min(1, Math.max(0, (window.scrollY - start) / span));

      // Pace by leg, not by arc length: otherwise the 530-mile empty
      // Nevada crossing eats a third of the scroll with nothing happening.
      const n = legT.length - 1;
      const i = Math.min(Math.floor(s * n), n - 1);
      const f = s * n - i;
      svgRoot.style.setProperty('--t', (legT[i] + f * (legT[i + 1] - legT[i])).toFixed(5));

      // only touch the DOM when the integer changes
      const count = Math.min(pins.length, Math.floor(s * n) + 1);
      if (count !== reached) {
        reached = count;
        pins.forEach((p, j) => {
          p.classList.toggle('is-reached', j < count);
          p.classList.toggle('is-current', j === count - 1);
          if (j === count - 1) p.setAttribute('aria-current', 'true');
          else p.removeAttribute('aria-current');
        });
      }
    }

    if (reduced.matches) {
      svgRoot.style.setProperty('--t', 1);
      pins.forEach(p => p.classList.add('is-reached'));
    } else {
      measureMap();
      register(paintMap, measureMap);
    }
  }

  /* ---------- parallax --------------------------------------- */

  const media = [...document.querySelectorAll('.stop__media')];
  let mCache = [];

  function measureParallax () {
    mCache = media.map(m => {
      const r = m.getBoundingClientRect();
      return { el: m, top: r.top + window.scrollY, h: r.height };
    });
  }

  function paintParallax () {
    const vh = window.innerHeight;
    const mid = window.scrollY + vh / 2;
    for (const c of mCache) {
      const centre = c.top + c.h / 2;
      const rel = Math.max(-1, Math.min(1, (centre - mid) / vh));
      c.el.style.setProperty('--py', (rel * 42).toFixed(1) + 'px');
    }
  }

  /* ---------- wire it up ------------------------------------- */

  if (!reduced.matches) {
    register(paintParallax, measureParallax);
    measureParallax();

    window.addEventListener('scroll', onScroll, { passive: true });

    let rt;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(remeasure, 150);
    });
    window.addEventListener('orientationchange', () => setTimeout(remeasure, 300));
    window.addEventListener('load', remeasure);

    // a font swap shifts offsetTop and silently desyncs the scrubber
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);

    onScroll();
  }

  /* ---------- reveals ---------------------------------------- */

  const revealTargets = [...document.querySelectorAll('.stop, .route__head')];
  const heroInner = document.querySelector('.hero__inner');

  if (reduced.matches) {
    revealTargets.forEach(t => t.classList.add('is-in'));
    if (heroInner) heroInner.classList.add('is-in');
  } else {
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('is-in'); obs.unobserve(e.target); }
      });
    }, { threshold: 0.2, rootMargin: '0px 0px -8% 0px' });
    revealTargets.forEach(t => io.observe(t));

    if (heroInner) requestAnimationFrame(() => heroInner.classList.add('is-in'));
  }

  /* ---------- nav rail --------------------------------------
     Centre-line detection rather than a visibility threshold:
     the route section is several viewports tall and can never
     be 50% visible, so a threshold would silently never fire.
  ----------------------------------------------------------- */

  const ticks = [...document.querySelectorAll('.rail__tick')];
  const sections = ticks
    .map(t => document.querySelector(t.getAttribute('href')))
    .filter(Boolean);

  if (sections.length) {
    const navIo = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const id = '#' + e.target.id;
        ticks.forEach(t => t.classList.toggle('is-active', t.getAttribute('href') === id));
      });
    }, { rootMargin: '-50% 0px -50% 0px', threshold: 0 });
    sections.forEach(s => navIo.observe(s));
  }

}());
