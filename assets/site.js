(function () {
  'use strict';

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia('(pointer: coarse)').matches;

  /* ------------------------------------------------------------------
     brief form: compose a mailto, nothing leaves the page otherwise.
     each page carries its own wording on the form's data attributes.
     ------------------------------------------------------------------ */
  const form = document.getElementById('form');
  const note = document.getElementById('form-note');
  const copyBtn = document.getElementById('form-copy');
  let composed = '';
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const name = (f.get('name') || '').toString().trim();
    const email = (f.get('email') || '').toString().trim();
    const company = (f.get('company') || '').toString().trim();
    const brief = (f.get('brief') || '').toString().trim();
    if (!name || !email || !brief) { note.textContent = form.dataset.need; return; }
    const subject = form.dataset.subject + name + (company ? ' · ' + company : '');
    const body = brief + '\n\n' + name + '\n' + email + (company ? '\n' + company : '');
    composed = body;
    window.location.href = 'mailto:info@flt.pt?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    note.textContent = form.dataset.handed;
    // a browser with no mail handler does nothing visible on a mailto link,
    // so offer the composed text back instead of letting the brief go to waste
    copyBtn.hidden = false;
  });
  copyBtn.addEventListener('click', () => {
    const done = () => { note.textContent = form.dataset.copied; };
    const fallback = () => {
      const brief = document.getElementById('f-brief');
      brief.focus(); brief.select();
      note.textContent = form.dataset.copyFailed;
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(composed).then(done, fallback);
    else fallback();
  });

  /* ------------------------------------------------------------------
     the line: 30° w to 45° e, a tick every 5 degrees, a taller one every 15
     ------------------------------------------------------------------ */
  const geoHost = document.getElementById('geo');
  const lonX = (lon) => Math.round(geoHost.clientWidth * (lon + 30) / 75) + 0.5;   // on the pixel grid, so hairlines stay crisp
  const geoMarks = Array.from(document.querySelectorAll('.geo-mark'));
  const geoSpan = document.getElementById('geo-span');
  const placeGeoMarks = () => {
    geoMarks.forEach((m) => { const x = lonX(parseFloat(m.dataset.lon)); m.style.left = x + 'px'; m.style.setProperty('--mx', x + 'px'); });   // --mx: the room a label has to its left
    const a = lonX(parseFloat(geoSpan.dataset.from)), b = lonX(parseFloat(geoSpan.dataset.to));
    geoSpan.style.left = a + 'px'; geoSpan.style.width = (b - a) + 'px';
  };
  placeGeoMarks();

  const ticksEl = document.getElementById('geo-ticks');
  for (let deg = -30; deg <= 45; deg += 5) {
    const t = document.createElement('span');
    t.className = 'geo-tick' + (deg % 15 === 0 ? ' major' : '');
    t.style.left = ((deg + 30) / 75 * 100) + '%';
    ticksEl.appendChild(t);
    if (deg % 15 === 0) {
      const d = document.createElement('span');
      d.className = 'geo-deg' + (deg === -30 ? ' is-first' : deg === 45 ? ' is-last' : '');   // the two end labels stay inside the line
      d.style.left = t.style.left;
      d.textContent = deg === 0 ? '0°' : Math.abs(deg) + '° ' + (deg < 0 ? 'w' : 'e');
      ticksEl.appendChild(d);
    }
  }

  // one debounced resize path. on touch screens a change of height alone is the
  // address bar coming and going, and nothing here depends on it
  let lastW = window.innerWidth, rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      if (coarse && window.innerWidth === lastW) return;
      lastW = window.innerWidth;
      placeGeoMarks();
      dropKeeps();   // the bounce's stand-ins are sized to the old layout
    }, 120);
  });

  /* ------------------------------------------------------------------
     header hairline. sy is the scroll position the motion below reads, so
     nothing in the frame loop has to ask the layout for it.
     ------------------------------------------------------------------ */
  const header = document.getElementById('header');
  let sy = window.scrollY, scrolled = null;
  function onScroll(y) {
    sy = y;
    const s = y > 8;
    if (s !== scrolled) { scrolled = s; header.classList.toggle('is-scrolled', s); }
  }
  const onWindowScroll = () => onScroll(window.scrollY);
  onWindowScroll();
  window.addEventListener('scroll', onWindowScroll, { passive: true });

  /* ------------------------------------------------------------------
     motion. all of it is skipped under prefers-reduced-motion.
     ------------------------------------------------------------------ */
  if (reduced || !window.gsap) return;
  gsap.registerPlugin(ScrollTrigger, SplitText);
  ScrollTrigger.config({ ignoreMobileResize: true });

  // the hero holds still until the type is in: the period and the lines wait hidden,
  // so nothing shows and then vanishes before the entrance
  const period = document.getElementById('period');
  const h1 = period.parentElement;
  const heroLines = document.querySelectorAll('.hero [data-lines]');
  const heroReveal = document.querySelectorAll('.hero [data-reveal]');
  gsap.set(period, { opacity: 0 });
  gsap.set([heroLines, heroReveal], { autoAlpha: 0 });

  const fontsIn = document.fonts && document.fonts.load
    ? Promise.race([document.fonts.load('600 1em Inter').then(() => document.fonts.ready), new Promise((r) => setTimeout(r, 2000))]).catch(() => {})
    : Promise.resolve();
  // the bounce leaves its stand-ins on the page, measured against the glyphs. if the font came
  // in after that, they sit in the wrong place: take them away once the entrance is over and
  // let the real glyph show. the resize path does the same
  const dropKeeps = () => document.querySelectorAll('.intro-keep').forEach((n) => n.remove());
  let fontsLate = false, introOver = false;
  fontsIn.then(() => {
    if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(() => { fontsLate = true; if (introOver) dropKeeps(); });
    start();
  });

  function start() {
    const smooth = (u) => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };
    const ease = (k, dt) => 1 - Math.pow(1 - k, dt * 60);   // a per-frame factor at 60 fps, the same feel at any refresh rate
    const TAU = Math.PI * 2;

    // smooth scroll
    let lenis = null;
    if (window.Lenis) {
      lenis = new Lenis({ lerp: 0.1, smoothWheel: true, autoRaf: false });
      window.removeEventListener('scroll', onWindowScroll);
      lenis.on('scroll', (e) => { onScroll(e.scroll); ScrollTrigger.update(); });
      gsap.ticker.add((t) => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
      document.querySelectorAll('a[href^="#"]').forEach(a => {
        a.addEventListener('click', (ev) => {
          const id = a.getAttribute('href');
          const target = id === '#top' ? 0 : document.querySelector(id);
          if (target === null) return;
          ev.preventDefault();
          lenis.scrollTo(target, { offset: -64, duration: 1.1 });
        });
      });
    }

    // the field. points drift in three depths behind the services, shift with the
    // cursor, slide with the scroll, and settle into a grid as you read through.
    // the canvas is one screen tall (plus a margin) and rides along inside the
    // section, so only the part in view is ever drawn.
    const fieldHost = document.getElementById('services');
    const canvas = document.getElementById('field');
    const ctx = canvas.getContext('2d');
    const DEPTHS = [0.35, 0.65, 1];
    const field = { w: 0, h: 0, ch: 0, pad: 0, top: 0, left: 0, off: -1, dpr: 1, p: 0, mx: 0, my: 0, tx: 0, ty: 0, dots: [], t: 0, k: -1, blank: false };

    function sizeField() {
      const r = fieldHost.getBoundingClientRect();
      field.top = r.top + window.scrollY; field.left = r.left;
      field.dpr = Math.min(1.5, window.devicePixelRatio || 1);
      field.w = r.width; field.h = r.height;
      const ch = canvas.clientHeight || window.innerHeight;
      field.ch = Math.min(r.height, ch);
      field.pad = Math.max(0, (ch - window.innerHeight) / 2);   // the margin above the screen, for scrolls the frame loop has not caught up with yet
      canvas.width = Math.round(field.w * field.dpr);
      canvas.height = Math.round(field.ch * field.dpr);
      ctx.setTransform(field.dpr, 0, 0, field.dpr, 0, 0);
      field.off = -1; field.blank = false;
      // one point per grid cell; the grid is where they end up
      const cell = coarse ? 92 : 76;
      const cols = Math.max(4, Math.floor(r.width / cell));
      const rows = Math.max(4, Math.floor(r.height / cell));
      const n = Math.min(220, cols * rows);
      const ox = (r.width - (cols - 1) * cell) / 2, oy = (r.height - (rows - 1) * cell) / 2;
      const keep = field.dots;
      field.dots = [];
      for (let i = 0; i < n; i++) {
        const prev = keep[i];
        const z = DEPTHS[i % 3];
        field.dots.push({
          x: prev ? prev.x : Math.random(), y: prev ? prev.y : Math.random(), z,
          gx: ox + (i % cols) * cell, gy: oy + Math.floor(i / cols) * cell,
          ph: prev ? prev.ph : Math.random() * Math.PI * 2,
          sp: prev ? prev.sp : 0.004 + Math.random() * 0.006,
          amp: prev ? prev.amp : 0.004 + Math.random() * 0.008,
          vx: prev ? prev.vx : (Math.random() - 0.5) * 0.004, px: 0, py: 0
        });
      }
      // the point's seat: the grid point nearest the upper right, held steady
      let best = 0, bd = 1e9;
      field.dots.forEach((d, i) => { const dd = Math.hypot(d.gx - r.width * 0.86, d.gy - r.height * 0.3); if (dd < bd) { bd = dd; best = i; } });
      field.k = best;
      const seat = field.dots[best]; seat.x = seat.gx / r.width; seat.y = seat.gy / r.height; seat.vx = 0; seat.amp *= 0.4;
    }
    function drawField(dt) {
      field.t += dt;
      const e = ease(0.06, dt);
      field.mx += (field.tx - field.mx) * e;
      field.my += (field.ty - field.my) * e;
      const p = field.p;
      const k = smooth((p - 0.25) / 0.45);          // scatter -> grid through the middle of the section
      const fade = smooth(p / 0.12) * (1 - smooth((p - 0.9) / 0.1));
      const dots = field.dots;
      for (let i = 0; i < dots.length; i++) {        // every position, the seat's included: the point follows it
        const d = dots[i];
        d.x += d.vx * dt; if (d.x < -0.02) d.x = 1.02; if (d.x > 1.02) d.x = -0.02;
        const wob = Math.sin(field.t * d.sp * 60 + d.ph) * d.amp;
        const fx = (d.x + wob) * field.w + field.mx * d.z * 26;
        const fy = (d.y + wob * 0.6) * field.h + field.my * d.z * 16 - (p - 0.5) * 140 * d.z;
        d.px = fx + (d.gx + field.mx * 8 - fx) * k;
        d.py = fy + (d.gy - fy) * k;
      }
      const off = Math.max(0, Math.min(field.h - field.ch, sy - field.top - field.pad));
      if (off !== field.off) { field.off = off; canvas.style.transform = 'translate3d(0,' + off + 'px,0)'; }
      const a0 = fade * (1 - k * 0.35);
      if (a0 * 0.21 <= 0.005) {                       // even the nearest layer is gone
        if (!field.blank) { ctx.clearRect(0, 0, field.w, field.ch); field.blank = true; }
        return;
      }
      field.blank = false;
      ctx.clearRect(0, 0, field.w, field.ch);
      ctx.fillStyle = '#2a2730';
      // one path per depth: each layer shares its size and its alpha
      for (let L = 0; L < 3; L++) {
        const z = DEPTHS[L], a = (0.12 + z * 0.26) * a0;
        if (a <= 0.005) continue;
        const r = (0.9 + z * 1.5) * (1 - k * 0.3);
        ctx.globalAlpha = a;
        ctx.beginPath();
        for (let i = L; i < dots.length; i += 3) {
          if (i === field.k) continue;                 // the point sits here
          const d = dots[i], y = d.py - off;
          if (y < -r || y > field.ch + r) continue;
          ctx.moveTo(d.px + r, y);
          ctx.arc(d.px, y, r, 0, TAU);
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    sizeField();
    let fieldVisible = false;
    new IntersectionObserver((es) => { fieldVisible = es[0].isIntersecting; }).observe(fieldHost);
    gsap.ticker.add((t, dtMs) => { if (fieldVisible) drawField(Math.min(0.05, dtMs / 1000)); });
    if (!coarse) {
      window.addEventListener('pointermove', (e) => {
        field.tx = (e.clientX / window.innerWidth - 0.5) * 2;
        field.ty = (e.clientY / window.innerHeight - 0.5) * 2;
      }, { passive: true });
    }
    const servicesText = fieldHost.querySelector('.wrap');
    gsap.timeline({
      scrollTrigger: {
        trigger: fieldHost, start: 'top bottom', end: 'bottom top', scrub: true,
        onUpdate: (st) => { field.p = st.progress; }
      }
    })
      .fromTo(servicesText, { opacity: 0, scale: 0.94, y: 60 }, { opacity: 1, scale: 1, y: 0, ease: 'none', duration: 0.28 }, 0.02)
      .to(servicesText, { opacity: 0, scale: 0.62, y: -80, transformOrigin: '50% 30%', ease: 'none', duration: 0.3 }, 0.68);

    // the cybersecurity mark: the same icosahedron the point is built from, turning around it,
    // on its own small canvas. 12 vertices, 30 edges, drawn in as the section arrives.
    const cyber = document.getElementById('cyber-mark');
    const wire = document.createElement('canvas');
    wire.className = 'wire'; wire.setAttribute('aria-hidden', 'true');
    cyber.appendChild(wire);
    const WS = 84, wdpr = Math.min(2, window.devicePixelRatio || 1);
    wire.width = wire.height = Math.round(WS * wdpr);
    const wctx = wire.getContext('2d');
    const PHI = (1 + Math.sqrt(5)) / 2, VN = Math.hypot(1, PHI);
    const VERTS = [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]]
      .map((v) => v.map((c) => c / VN));
    const FACES = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
    const EDGES = [], seen = new Set();
    for (let f = 0; f < FACES.length; f += 3) {
      for (let j = 0; j < 3; j++) {
        const a = FACES[f + j], b = FACES[f + (j + 1) % 3], key = Math.min(a, b) + '-' + Math.max(a, b);
        if (!seen.has(key)) { seen.add(key); EDGES.push([a, b]); }
      }
    }
    const proj = VERTS.map(() => [0, 0]);
    const wst = { op: 0, d: 0 };
    let wireOn = false;
    new IntersectionObserver((es) => { wireOn = es[0].isIntersecting; }).observe(cyber);
    function drawWire(t) {
      wctx.setTransform(wdpr, 0, 0, wdpr, 0, 0);
      wctx.clearRect(0, 0, WS, WS);
      if (wst.op < 0.01 || wst.d <= 0) return;
      // about four minutes a turn, tipped forward; a long lens, so barely any perspective
      const ry = t * 0.026, cy = Math.cos(ry), syn = Math.sin(ry), cx = Math.cos(0.42), sx = Math.sin(0.42);
      const R = WS / 2, D = 1600;
      for (let i = 0; i < VERTS.length; i++) {
        const [x, y, z] = VERTS[i];
        const x1 = x * cy + z * syn, z1 = -x * syn + z * cy;
        const y2 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;
        const f = D / (D - z2 * R);
        proj[i][0] = R + x1 * R * f; proj[i][1] = R - y2 * R * f;
      }
      const total = EDGES.length * wst.d, full = Math.floor(total), frac = total - full;
      wctx.globalAlpha = wst.op;
      wctx.strokeStyle = '#15141a';
      wctx.lineWidth = 0.8;
      wctx.beginPath();
      for (let i = 0; i < Math.min(full + 1, EDGES.length); i++) {
        const a = proj[EDGES[i][0]], b = proj[EDGES[i][1]], u = i < full ? 1 : frac;
        wctx.moveTo(a[0], a[1]);
        wctx.lineTo(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u);
      }
      wctx.stroke();
    }
    gsap.timeline({ scrollTrigger: { trigger: '.offers', start: 'top 78%', once: true } })
      .from('.mark-dot', { scale: 0, duration: 0.6, ease: 'back.out(2)', stagger: 0.15 }, 0)
      .to(wst, { op: 0.9, duration: 0.9, ease: 'power2.out' }, 0.6)
      .to(wst, { d: 1, duration: 4.5, ease: 'power1.inOut' }, 0.5);

    // section heads: the rule under the heading draws once
    document.querySelectorAll('.section-head').forEach((head) => {
      gsap.from(head, {
        scrollTrigger: { trigger: head, start: 'top 85%', once: true },
        opacity: 0, y: 10, duration: 0.7, ease: 'power2.out'
      });
    });

    /* ------------------------------------------------------------------
       the point. the period of "floating." is where it starts: the entrance
       lands and the orb takes the dot's place. from there one orb travels the
       page: a dot in the field, the marker on the method track, the aveiro
       mark on the line, the period of the last heading.
       positions are kept in page coordinates, measured on refresh, so the frame
       loop never reads the layout and the orb stays locked to its anchor while
       the page scrolls.
       ------------------------------------------------------------------ */
    const orbEl = document.getElementById('orb');
    const BASE = 64;                                     // the orb's css size; it only ever scales down from here, so it stays crisp
    const steps = gsap.utils.toArray('.step');
    const stepsEl = document.getElementById('steps');
    const marker = document.getElementById('marker');
    const track = stepsEl.querySelector('.track');
    const geoMark = document.getElementById('geo-mark');
    const geoDot = geoMark.querySelector('.geo-dot');
    const briefDot = document.getElementById('brief-dot');
    const sectionEls = Array.from(document.querySelectorAll('[data-orb]'));
    const stopEls = ['#services', '#method', '#studio', '#brief'].map((q) => document.querySelector(q));
    let scrollStep = steps[0], hoverStep = null;

    const C = { vh: window.innerHeight, tops: [], stops: [], period: null, track: 0, steps: new Map(), geo: null, bdot: null };
    const docBox = (el) => { const r = el.getBoundingClientRect(), y0 = window.scrollY; return { x: r.left + r.width / 2, y: r.top + r.height / 2 + y0, s: r.width, top: r.top + y0 }; };
    function measure() {
      C.vh = window.innerHeight;
      C.tops = sectionEls.map((el) => docBox(el).top);
      C.stops = [0, ...stopEls.map((el) => docBox(el).top - 64)];
      C.period = docBox(period);
      C.track = docBox(track).x;
      steps.forEach((s) => C.steps.set(s, docBox(s.querySelector('h3')).y));
      C.geo = docBox(geoMark);
      C.bdot = docBox(briefDot);
    }
    measure();

    const STATES = {
      hero:     { follow: 'period', k: 0.6 },
      services: { follow: 'field',  k: 0.12, alpha: 0.4 },
      method:   { follow: 'step',   k: 0.3 },
      studio:   { follow: 'geo',    k: 0.2 },
      brief:    { follow: 'bdot',   k: 0.2 },
      footer:   { follow: 'bdot',   k: 0.3 }
    };
    const FOLLOW = {
      period: () => C.period,
      // in the field the point is one of the dots: as small and as faint as its neighbours
      field:  () => { const d = field.dots[field.k]; return { x: field.left + d.px, y: field.top + d.py, s: 5 }; },
      // the marker on the method track, level with the current step's title
      step:   () => ({ x: C.track, y: C.steps.get(hoverStep || scrollStep), s: 12 }),
      // the aveiro mark, including its landing on the line: its tween values are read from gsap, not the layout
      geo:    () => {
        const y = gsap.getProperty(geoDot, 'y'), gsx = gsap.getProperty(geoDot, 'scaleX'), gsy = gsap.getProperty(geoDot, 'scaleY');
        return { x: C.geo.x, y: C.geo.y - 16 + y - 6 * gsy, s: 12 * gsx };
      },
      bdot:   () => C.bdot
    };
    const o = { x: 0, y: 0, s: 1, section: 'hero', follow: 'period', k: 0.6, hop: null, took: false };
    const sq = { x: 1, y: 1 };                           // squash and stretch, on top of the size
    let hopTl = null, lastTf = '';
    const alphaOf = (name) => { const a = (STATES[name] || STATES.hero).alpha; return a === undefined ? 1 : a; };

    function renderOrb() {
      const s = o.s / BASE;
      const tf = 'translate3d(' + (o.x - BASE / 2).toFixed(2) + 'px,' + (o.y - sy - BASE / 2).toFixed(2) + 'px,0) scale(' + (s * sq.x).toFixed(4) + ',' + (s * sq.y).toFixed(4) + ')';
      if (tf !== lastTf) { orbEl.style.transform = tf; lastTf = tf; }
    }
    function applyState(name) {
      const st = STATES[name] || STATES.hero;
      o.section = name; o.follow = st.follow; o.k = st.k;
      if (o.hop) { hopTl.kill(); o.hop = null; gsap.to(sq, { x: 1, y: 1, duration: 0.3, ease: 'power2.out' }); }
      if (o.took) gsap.to(orbEl, { opacity: alphaOf(name), duration: 1.0, ease: 'power2.inOut', overwrite: 'auto' });
    }
    // the entrance lands: the orb is placed exactly on the dot and the two swap in one frame
    function takeover() {
      C.period = docBox(period);
      o.x = C.period.x; o.y = C.period.y; o.s = C.period.s;
      renderOrb();
      gsap.set(orbEl, { opacity: alphaOf(o.section) });
      period.style.opacity = '0';
      o.took = true;
    }

    gsap.ticker.add((t, dtMs) => {
      const dt = Math.min(0.05, dtMs / 1000);
      // the current section is the last one whose top has passed the 55% line; at the top that is the hero
      const line = sy + C.vh * 0.55;
      let cur = 'hero';
      for (let i = 0; i < C.tops.length; i++) if (C.tops[i] <= line) cur = sectionEls[i].dataset.orb;
      if (cur !== o.section) applyState(cur);
      if (wireOn) drawWire(t);
      if (!o.took) return;
      const g = FOLLOW[o.follow](), e = ease(o.k, dt);
      if (o.hop) {
        const u = o.hop.u;
        o.x = o.hop.fx + (g.x - o.hop.fx) * u;
        o.y = o.hop.fy + (g.y - o.hop.fy) * u;
      } else {
        o.x += (g.x - o.x) * e; o.y += (g.y - o.y) * e;
      }
      o.s += (g.s - o.s) * e;
      renderOrb();
    });

    // method: the orb is the status indicator. it sits on the step you are reading
    // and hops to whichever step you hover, with the brand's squash and stretch.
    gsap.set(marker, { opacity: 0 });                    // the dom marker steps aside for the orb
    function markerTo(step, animate) {
      steps.forEach(x => x.classList.toggle('is-active', x === step));
      if (!o.took || o.section !== 'method' || !animate) return;
      const to = C.steps.get(step);
      if (Math.abs(to - o.y) < 2) return;
      if (hopTl) hopTl.kill();
      o.hop = { u: 0, fx: o.x, fy: o.y };
      const dur = gsap.utils.clamp(0.35, 0.7, Math.abs(to - o.y) / 500);
      hopTl = gsap.timeline({ onComplete() { o.hop = null; } })
        .to(sq, { y: 0.72, x: 1.22, duration: 0.1, ease: 'power2.in' }, 0)          // anticipation
        .to(o.hop, { u: 1, duration: dur, ease: 'power2.inOut' }, 0.1)                // travel
        .to(sq, { y: 1.3, x: 0.84, duration: dur * 0.5, ease: 'power2.out' }, 0.1)   // stretch in flight
        .to(sq, { y: 0.6, x: 1.35, duration: 0.09, ease: 'power2.in' }, 0.1 + dur)   // impact
        .to(sq, { y: 1, x: 1, duration: 0.5, ease: 'elastic.out(1.1, 0.45)' }, 0.19 + dur);
    }
    markerTo(steps[0], false);
    steps.forEach((step) => {
      step.addEventListener('pointerenter', () => { hoverStep = step; markerTo(step, true); });
      ScrollTrigger.create({
        trigger: step, start: 'top 55%', end: 'bottom 55%',
        onToggle: (st) => { if (st.isActive) { scrollStep = step; if (!hoverStep) markerTo(step, true); } }
      });
    });
    stepsEl.addEventListener('pointerleave', () => { hoverStep = null; markerTo(scrollStep, true); });

    // studio: statement lines rise on ink
    const darkSplit = SplitText.create('[data-lines-dark]', { type: 'lines', mask: 'lines' });
    gsap.from(darkSplit.lines, {
      scrollTrigger: { trigger: '.studio', start: 'top 70%', once: true },
      yPercent: 110, duration: 0.9, ease: 'power3.out', stagger: 0.07
    });

    // studio: the line draws across; as it passes each longitude a mark lands there, and the
    // span over europe is drawn under it, closed at both ends
    const DRAW = 2.2;
    const at = (lon) => DRAW * (lon + 30) / 75;
    const land = (tl, sel, t) => tl
      .from(sel + ' .geo-dot', { y: -40, opacity: 0, scaleY: 1.3, scaleX: 0.8, duration: 0.55, ease: 'power2.in' }, t)
      .to(sel + ' .geo-dot', { scaleY: 0.78, scaleX: 1.22, duration: 0.1, ease: 'power2.in' }, '>')
      .to(sel + ' .geo-dot', { scaleY: 1, scaleX: 1, duration: 0.6, ease: 'elastic.out(1.1, 0.45)' }, '>')
      .from(sel + ' .geo-stem', { scaleY: 0, duration: 0.5, ease: 'power2.out' }, '<0.05')
      .from(sel + ' .geo-label', { opacity: 0, y: 8, duration: 0.7, ease: 'power2.out' }, '<0.15');
    const geoTl = gsap.timeline({ scrollTrigger: { trigger: '#geo', start: 'top 92%', end: 'top 55%', scrub: 0.6 } })
      .from('#geo-line', { scaleX: 0, duration: DRAW, ease: 'power2.inOut' }, 0)
      .from('.geo-tick', { scaleY: 0, opacity: 0, duration: 0.5, ease: 'power2.out',
        stagger: { each: DRAW / 16, ease: 'power2.inOut' } }, 0.05)
      .from('.geo-deg', { opacity: 0, duration: 0.5, ease: 'power2.out', stagger: { each: DRAW * 3 / 16 } }, 0.3);
    land(geoTl, '#geo-mark', at(-8.6538) + 0.05);
    land(geoTl, '#geo-mark-utc', at(0) + 0.05);
    geoTl
      .from('#geo-span .geo-span-end.is-l', { scaleY: 0, opacity: 0, duration: 0.3, ease: 'power2.out' }, at(-10) + 0.1)
      .from('#geo-span .geo-span-line', { scaleX: 0, duration: at(40) - at(-10), ease: 'none' }, at(-10) + 0.1)
      .from('#geo-span .geo-span-end.is-r', { scaleY: 0, opacity: 0, duration: 0.3, ease: 'power2.out' }, at(40) + 0.1)
      .from('#geo-span .geo-span-label', { opacity: 0, y: 8, duration: 0.7, ease: 'power2.out' }, at(40) + 0.2);
    gsap.to('#geo', { opacity: 0, ease: 'none', scrollTrigger: { trigger: '#geo', start: 'top 28%', end: 'top 6%', scrub: true } });

    // brief form: fields settle in
    gsap.from('.form .field, .form .form-actions', {
      scrollTrigger: { trigger: '.form', start: 'top 80%', once: true },
      opacity: 0, y: 10, duration: 0.6, stagger: 0.06, ease: 'power2.out'
    });

    /* ------------------------------------------------------------------
       the entrance. the period arrives a different way on each visit: the
       brand bounce, under a parachute, on a cloud, tied to a balloon, decrypted,
       rolling in, out of a ninja's smoke, or up in a lift. every one ends the same way: the dot meets the baseline,
       squashes, settles, and the orb takes its place. props are ink hairlines
       on paper, sized in em of the wordmark. ?intro=<name> picks one.
       ------------------------------------------------------------------ */
    const fs = parseFloat(getComputedStyle(h1).fontSize) || 160;
    const E = fs;                                        // one em of the wordmark, in px
    const SVGNS = 'http://www.w3.org/2000/svg';
    const f2 = (v) => Math.round(v * 100) / 100;
    const svgEl = (tag, attrs, parent) => {
      const n = document.createElementNS(SVGNS, tag);
      for (const k in attrs) n.setAttribute(k, attrs[k]);
      if (parent) parent.appendChild(n);
      return n;
    };
    const place = (n, x, y, sx, sy) => { n.style.transform = 'translate3d(' + f2(x) + 'px,' + f2(y) + 'px,0) scale(' + f2(sx) + ',' + f2(sy) + ')'; };

    // a stand-in for the period, laid exactly over it, with an svg whose origin is the dot's centre at rest
    function makeRig() {
      const rig = document.createElement('span');
      rig.className = 'intro-rig';
      rig.setAttribute('aria-hidden', 'true');
      rig.style.left = period.offsetLeft + 'px';
      rig.style.top = period.offsetTop + 'px';
      rig.style.width = period.offsetWidth + 'px';
      rig.style.height = period.offsetHeight + 'px';
      rig.style.setProperty('--hair', f2(Math.max(1, Math.min(2.4, E / 100))) + 'px');
      const svg = svgEl('svg', { class: 'intro-svg', width: 1, height: 1, focusable: 'false' }, rig);
      const dot = document.createElement('span');
      dot.className = 'intro-dot';
      rig.appendChild(dot);
      h1.appendChild(rig);
      const pr = period.getBoundingClientRect();
      return { rig, svg, dot, rr: period.offsetWidth / 2, vx: pr.left + pr.width / 2 };
    }
    // the brand's landing, as on the method track: squash on contact, then the elastic settle
    const touchdown = (tl, st, t, depth) => tl
      .to(st, { sy: 1 - 0.4 * depth, sx: 1 + 0.35 * depth, duration: 0.09, ease: 'power2.in' }, t)
      .to(st, { sy: 1, sx: 1, duration: 0.55, ease: 'elastic.out(1.1, 0.45)' }, t + 0.09);

    // the word's geometry, for the bounce: where each letter is (from layout) and the shape
    // of its top (from one off-screen render of the glyph). the i is split into its stem and
    // its tittle. y is baseline-relative, negative up; x is in h1 px.
    function readWord() {
      const span = h1.firstElementChild, text = span.textContent, tn = span.firstChild;
      const cs = getComputedStyle(span);
      const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
      const B = Math.ceil(fs * 1.05), CH = Math.ceil(fs * 1.35);
      const h1r = h1.getBoundingClientRect(), range = document.createRange();
      const terrain = new Map(), letters = [];
      let tittle = null;
      for (let k = 0; k < text.length; k++) {
        range.setStart(tn, k); range.setEnd(tn, k + 1);
        const left = Math.round(range.getBoundingClientRect().left - h1r.left);
        cx.font = cs.fontWeight + ' ' + fs + 'px ' + cs.fontFamily;
        const W = Math.ceil(cx.measureText(text[k]).width + fs * 0.4);
        cv.width = W; cv.height = CH;
        cx.font = cs.fontWeight + ' ' + fs + 'px ' + cs.fontFamily;
        cx.fillText(text[k], 0, B);
        const a = cx.getImageData(0, 0, W, CH).data;
        // connected components: every letter is one, except the i, which is two
        const lab = new Uint8Array(W * CH), comps = [], stack = [];
        for (let y = 0; y < CH; y++) for (let x = 0; x < W; x++) {
          if (lab[y * W + x] || a[(y * W + x) * 4 + 3] < 128) continue;
          const c = { x0: x, x1: x, y0: y, y1: y, area: 0, top: new Map() };
          comps.push(c); lab[y * W + x] = 1; stack.push(x, y);
          while (stack.length) {
            const yy = stack.pop(), xx = stack.pop();
            c.area++;
            if (xx < c.x0) c.x0 = xx; if (xx > c.x1) c.x1 = xx; if (yy < c.y0) c.y0 = yy; if (yy > c.y1) c.y1 = yy;
            const t = c.top.get(xx); if (t === undefined || yy < t) c.top.set(xx, yy);
            if (xx > 0 && !lab[yy * W + xx - 1] && a[(yy * W + xx - 1) * 4 + 3] > 127) { lab[yy * W + xx - 1] = 1; stack.push(xx - 1, yy); }
            if (xx < W - 1 && !lab[yy * W + xx + 1] && a[(yy * W + xx + 1) * 4 + 3] > 127) { lab[yy * W + xx + 1] = 1; stack.push(xx + 1, yy); }
            if (yy > 0 && !lab[(yy - 1) * W + xx] && a[((yy - 1) * W + xx) * 4 + 3] > 127) { lab[(yy - 1) * W + xx] = 1; stack.push(xx, yy - 1); }
            if (yy < CH - 1 && !lab[(yy + 1) * W + xx] && a[((yy + 1) * W + xx) * 4 + 3] > 127) { lab[(yy + 1) * W + xx] = 1; stack.push(xx, yy + 1); }
          }
        }
        let dot = null;
        if (text[k] === 'i' && comps.length > 1) {
          dot = comps.reduce((m, c) => (c.area < m.area ? c : m));
          const w = dot.x1 + 1 - dot.x0, h = dot.y1 + 1 - dot.y0;
          // its corner radius, from how much of its box it fills (a circle fills pi/4 of it)
          const rc = Math.min(w, h) / 2 * Math.min(1, Math.sqrt(Math.max(0, (w * h - dot.area) / (4 - Math.PI))) / (Math.min(w, h) / 2));
          tittle = { x: left + dot.x0 + w / 2, y: dot.y0 - B + h / 2, w, h, r: w / 2, corner: rc, top: dot.y0 - B };
        }
        const letter = { ch: text[k], top: Infinity, x: 0 };
        comps.forEach((c) => {
          if (c === dot) return;
          c.top.forEach((y, col) => {
            const X = left + col, Y = y - B;
            if (!(terrain.get(X) < Y)) terrain.set(X, Y);
            if (Y < letter.top) letter.top = Y;
          });
        });
        // land in the middle of the letter's highest run
        const cols = []; terrain.forEach((Y, X) => { if (Y === letter.top) cols.push(X); });
        const own = cols.filter((X) => X >= left && X < left + W).sort((p, q) => p - q);
        letter.x = own.length ? (own[0] + own[own.length - 1]) / 2 : left + W / 2;
        letters.push(letter);
      }
      return { terrain, letters, tittle };
    }

    const INTROS = {
      // the brand ball, on the word itself: in from the left, it rides the top edge of the
      // letters, hugging every corner and dipping into every gap, with no squash. at the i it
      // runs into the tittle and knocks it off: the tittle flies over the n and the g and grows
      // into the period, while the ball rolls into the i's slot and shrinks to fit.
      bounce(r) {
        const R = r.rr, px = { x: period.offsetLeft + R, base: period.offsetTop + 2 * R };   // the period at rest; its bottom is the baseline
        const word = readWord(), tit = word.tittle;
        const terrainAt = (x) => { let m = Infinity; for (let X = Math.round(x - R * 0.5); X <= Math.round(x + R * 0.5); X++) { const v = word.terrain.get(X); if (v < m) m = v; } return m; };
        // the flight of something knocked: it pops off to the right, carries over the letters and
        // drops straight down onto its spot. a cubic, lifted until it clears every letter under it
        const bez = (p0, p1, p2, p3, u) => { const v = 1 - u; return { x: v * v * v * p0.x + 3 * v * v * u * p1.x + 3 * v * u * u * p2.x + u * u * u * p3.x, y: v * v * v * p0.y + 3 * v * v * u * p1.y + 3 * v * u * u * p2.y + u * u * u * p3.y }; };
        const arc = (a, b, T, t0) => {
          let lift = 0.3 * fs, c1, c2;
          for (let tries = 0; tries < 8; tries++, lift *= 1.15) {
            c1 = { x: a.x + 0.35 * fs, y: a.y - lift }; c2 = { x: b.x, y: b.y - 1.4 * lift };
            let clear = true;
            for (let u = 0.03; u < 0.97 && clear; u += 0.01) { const p = bez(a, c1, c2, b, u); if (p.y + a.r + (b.r - a.r) * u + 1 > terrainAt(p.x)) clear = false; }
            if (clear) break;
          }
          return { a, b, c1, c2, T, t0, t1: t0 + T };
        };
        const flyAt = (f, t) => {                            // flicked off fast, a long hover at the top, then a fall slowed by the air
          const u = Math.min(1, Math.max(0, t / f.T));
          let e;
          if (u < 0.28) { const w = u / 0.28; e = 0.5 * (1 - (1 - w) * (1 - w) * (1 - w)); }
          else { const w = (u - 0.28) / 0.72; e = 0.5 + 0.5 * w * w * (3 - 2 * w); }
          const p = bez(f.a, f.c1, f.c2, f.b, e);
          p.r = f.a.r + (f.b.r - f.a.r) * u;
          return p;
        };
        // the line: a big imaginary wheel rolls the top edge of the word and the ball hangs at
        // the bottom of it, so corners come out as wide arcs and gaps as shallow dips. that line
        // is softened once more and floated a little above the ink, so the ball never grazes a
        // letter: a roller coaster laid loosely over the word
        const ride = (x, rad) => {                           // the centre of a wheel of that radius resting on the ink within reach
          let m = Infinity;
          for (let c = Math.ceil(x - rad); c <= Math.floor(x + rad); c++) {
            const t = word.terrain.get(c);
            if (t === undefined) continue;
            const y = t - Math.sqrt(Math.max(0, rad * rad - (c - x) * (c - x)));
            if (y < m) m = y;
          }
          return m;
        };
        let xMin = Infinity, xMax = -Infinity;
        word.terrain.forEach((y, x) => { if (x < xMin) xMin = x; if (x > xMax) xMax = x; });
        const WHEEL = 2.4 * R, LIFT = 0.05 * fs, GAP = 0.02 * fs;
        const xIn = Math.round(xMin - 0.6 * fs), xOut = Math.round((tit ? tit.x : xMax) + R);
        const xs = [], ys = [];
        let first = -1;
        for (let x = xIn; x <= xOut; x++) {
          const y = ride(x, WHEEL);
          xs.push(x); ys.push(y === Infinity ? NaN : y + WHEEL - R - LIFT);
          if (first < 0 && y !== Infinity) first = xs.length - 1;
        }
        for (let i = 0; i < first; i++) ys[i] = ys[first];   // a level lead-in, only so the softening has something to lean on
        for (let i = first + 1; i < ys.length; i++) if (isNaN(ys[i])) ys[i] = ys[i - 1];
        const sig = 0.12 * fs, K = Math.ceil(3 * sig), kern = [];
        for (let k = -K; k <= K; k++) kern.push(Math.exp(-k * k / (2 * sig * sig)));
        const rail = [];
        for (let i = first; i < xs.length; i++) {
          let s = 0, w = 0;
          for (let k = -K; k <= K; k++) { const j = Math.min(ys.length - 1, Math.max(0, i + k)); s += ys[j] * kern[k + K]; w += kern[k + K]; }
          const y = Math.min(s / w, ride(xs[i], R) - GAP);   // softened, but never into the ink
          rail.push({ x: xs[i], y });
          if (tit && Math.hypot(xs[i] - tit.x, y - tit.y) <= R + tit.r) break;   // it has reached the tittle
        }
        // the way in: a fall from above and a little left of the f, on a slant, that bends over the
        // f and lands on the rail at the crest of the l. anchored to the letters, so it stays
        // inside the page at every width
        const lx = (word.letters.find((l) => l.ch === 'l') || word.letters[0]).x, fx = word.letters[0].x;
        let j = rail.findIndex((q) => q.x >= lx); if (j < 0 || j > rail.length - 20) j = 0;
        const join = rail[j], top = { x: fx - 0.35 * fs, y: join.y - 1.1 * fs };
        const drop = [];
        for (let k = 0; k < 60; k++) drop.push(bez(top, { x: fx - 0.06 * fs, y: join.y - 0.42 * fs }, { x: join.x - 0.3 * fs, y: join.y - 0.02 * fs }, join, k / 60));
        const pts = drop.concat(rail.slice(j));
        first = drop.length;
        // the pace: a coaster's, in one piece. the fall starts from near rest and gathers speed
        // under its own pull, landing on the rail at VIN; from there speed follows the height
        // below the crest it landed on, so it carries its momentum over the l, runs through the
        // dips, brakes on the climbs, and gets one last push into the tittle
        const cum = [0];
        for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
        const length = cum[cum.length - 1];
        const V0 = 0.6 * fs, VIN = 2.4 * fs, GRAV = 20 * fs;   // px/s at the top of the fall, px/s landing on the rail, px/s² along it
        const yTop = pts[0].y, yJoin = pts[first].y;
        const GFALL = (VIN * VIN - V0 * V0) / (2 * Math.max(1, yJoin - yTop));   // the fall's pull, so it lands at exactly VIN
        const tim = [0];
        for (let i = 1; i < pts.length; i++) {
          const y = (pts[i].y + pts[i - 1].y) / 2;
          let v = i <= first
            ? Math.sqrt(V0 * V0 + 2 * GFALL * Math.max(0, y - yTop))
            : Math.sqrt(Math.max(0.25 * VIN * VIN, VIN * VIN + 2 * GRAV * (y - yJoin)));
          if (tit) v *= 1 + 0.5 * smooth(1 - (length - cum[i]) / (0.4 * fs));   // the push, over the last bit before the tittle
          tim.push(tim[i - 1] + (cum[i] - cum[i - 1]) / v);
        }
        const HOLD = 0.25, ROLL = tim[tim.length - 1];
        const tKnock = HOLD + ROLL;
        const along = (t) => {                               // where the ride puts the ball at time t
          const tt = Math.min(ROLL, Math.max(0, t - HOLD));
          let i = 1; while (i < tim.length - 1 && tim[i] < tt) i++;
          const u = (tt - tim[i - 1]) / ((tim[i] - tim[i - 1]) || 1);
          return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * u, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * u };
        };
        const contact = pts[pts.length - 1];
        // the ball's position: boxes are the period's, scaled about the bottom centre
        const put = (el, p, s) => place(el, p.x - px.x, p.y + R * s, s, s);   // the box's bottom already sits on the baseline

        const rest = { x: px.x, y: -R, r: R };
        let ball = r.dot, flight, cover = null;
        const big = { x: contact.x, y: contact.y, s: 1, br: '50%' }, small = { br: '50%' };
        if (tit) {
          // the ball that stays is its own element, outside the rig, so it survives the rig's removal.
          // the cover goes under the rig, so the stand-in tittle shows from the first frame
          ball = document.createElement('span');
          ball.className = 'intro-dot intro-keep';
          ball.style.left = period.offsetLeft + 'px'; ball.style.top = period.offsetTop + 'px';
          ball.style.width = 2 * R + 'px'; ball.style.height = 2 * R + 'px';
          cover = document.createElement('span');
          cover.className = 'intro-cover intro-keep';
          cover.style.left = (tit.x - tit.w / 2 - 1) + 'px'; cover.style.top = (px.base + tit.top - 1) + 'px';
          cover.style.width = (tit.w + 2) + 'px'; cover.style.height = (tit.h + 2) + 'px';
          h1.insertBefore(cover, r.rig); h1.appendChild(ball);
          small.br = (tit.corner / tit.w * 100) + '%';
          r.dot.style.borderRadius = small.br;
          flight = arc({ x: tit.x, y: tit.y, r: tit.r }, rest, 1.05, tKnock);   // knocked clean over the n and the g
        } else {
          // no separate tittle in this font: the one ball rides every letter, then drops onto the period
          flight = arc({ x: contact.x, y: contact.y, r: R }, rest, 0.45, tKnock);
        }
        const end = flight.t1;
        const st = { t: 0 };
        const render = () => {
          const t = st.t;
          if (t < tKnock) { put(ball, along(t), 1); ball.style.opacity = Math.min(1, Math.max(0, (t - HOLD) / 0.2)); }   // fades in as it starts to fall
          else if (tit) { put(ball, big, big.s); ball.style.borderRadius = big.br; }
          if (tit && t < tKnock) put(r.dot, { x: tit.x, y: tit.y }, tit.r / R);
          else { const p = flyAt(flight, t - tKnock); put(r.dot, p, p.r / R); }
          r.dot.style.borderRadius = small.br;
        };
        const tl = gsap.timeline({ onUpdate: render }).to(st, { t: end, duration: end, ease: 'none' }, 0);
        if (tit) {
          tl.to(big, { x: tit.x, y: tit.y, s: tit.r / R, br: small.br, duration: 0.26, ease: 'power4.out' }, tKnock)   // stops dead and drops into the slot
            .to(small, { br: '50%', duration: 0.18, ease: 'power1.out' }, tKnock);                                    // the tittle rounds off as it goes
        }
        render();
        return { tl, land: end, rest: end };
      },

      // drifts down under a canopy, swinging gently; on landing the lines go slack and the canopy folds away
      parachute(r) {
        const D = 2.1, H = 0.66 * E, W = 0.6 * E, dome = 0.2 * E;
        const lines = svgEl('g', { class: 'soft' }, r.svg);
        const canopy = svgEl('g', {}, r.svg);
        const hem = [0, 1, 2, 3, 4].map((i) => -W / 2 + W * i / 4);
        let d = 'M' + f2(-W / 2) + ' ' + f2(-H) + 'C' + f2(-W / 2) + ' ' + f2(-H - dome * 1.3) + ' ' + f2(W / 2) + ' ' + f2(-H - dome * 1.3) + ' ' + f2(W / 2) + ' ' + f2(-H);
        for (let i = 4; i > 0; i--) d += 'Q' + f2((hem[i] + hem[i - 1]) / 2) + ' ' + f2(-H - 0.065 * E) + ' ' + f2(hem[i - 1]) + ' ' + f2(-H);
        svgEl('path', { class: 'solid', d: d + 'Z' }, canopy);
        const apex = -H - dome * 0.975;
        [1, 2, 3].forEach((i) => svgEl('path', { class: 'hair', d: 'M' + f2(hem[i]) + ' ' + f2(-H - 0.05 * E) + 'Q' + f2(hem[i] * 0.8) + ' ' + f2(apex + dome * 0.25) + ' 0 ' + f2(apex) }, canopy));
        [0, 1, 3, 4].forEach((i) => svgEl('path', { class: 'hair', d: 'M' + f2(hem[i]) + ' ' + f2(-H) + 'L0 ' + f2(-r.rr) }, lines));
        const st = { op: 0, x: -0.3 * E, y: -1.9 * E, ph: 0, sx: 1, sy: 1, cx: 0, cy: 0, cth: 0, csy: 1, cop: 1, lop: 1 };
        const render = () => {
          const th = 8 * Math.sin(st.ph * D * TAU / 1.5) * Math.pow(1 - st.ph, 1.2), rad = th * Math.PI / 180;
          r.rig.style.opacity = st.op;
          place(r.dot, st.x - H * Math.sin(rad), st.y + H * (Math.cos(rad) - 1), st.sx, st.sy);
          const frame = 'translate(' + f2(st.x + st.cx) + ' ' + f2(st.y + st.cy) + ') rotate(' + f2(th + st.cth) + ' 0 ' + f2(-H) + ')';
          lines.setAttribute('transform', frame);
          lines.setAttribute('opacity', st.lop);
          canopy.setAttribute('transform', frame + ' translate(0 ' + f2(-H) + ') scale(1 ' + f2(st.csy) + ') translate(0 ' + f2(H) + ')');
          canopy.setAttribute('opacity', st.cop);
        };
        const tl = gsap.timeline({ onUpdate: render })
          .to(st, { op: 1, duration: 0.35, ease: 'power1.out' }, 0)
          .to(st, { x: 0, y: 0, duration: D, ease: 'sine.out' }, 0)
          .to(st, { ph: 1, duration: D, ease: 'none' }, 0);
        touchdown(tl, st, D, 0.4);
        tl.to(st, { lop: 0, duration: 0.25, ease: 'power1.out' }, D)
          .to(st, { cx: 0.32 * E, cy: 0.12 * E, cth: 14, duration: 0.95, ease: 'power2.out' }, D)
          .to(st, { csy: 0.08, duration: 0.7, ease: 'power2.in' }, D + 0.1)
          .to(st, { cop: 0, duration: 0.4, ease: 'power1.in' }, D + 0.5);
        render();
        return { tl, land: D, rest: D + 0.64 };
      },

      // flies in on a little cloud above the word, hops off onto the baseline, and the cloud carries on
      nimbus(r) {
        const cloud = svgEl('g', {}, r.svg);
        const trail = svgEl('g', { class: 'soft' }, r.svg);
        const body = [[-0.22, 0, 0.1], [-0.05, -0.08, 0.14], [0.13, -0.05, 0.12], [0.27, 0.015, 0.085]];
        // outline trick: the shapes stroked at double weight, then filled over, leaves only the outer edge
        const outline = svgEl('g', { class: 'hair double' }, cloud), fill = svgEl('g', { class: 'cloud-fill' }, cloud);
        svgEl('path', { d: 'M' + f2(-0.3 * E) + ' ' + f2(0.06 * E) + 'C' + f2(-0.42 * E) + ' ' + f2(0.09 * E) + ' ' + f2(-0.52 * E) + ' ' + f2(0.02 * E) + ' ' + f2(-0.47 * E) + ' ' + f2(-0.05 * E) + 'C' + f2(-0.44 * E) + ' ' + f2(-0.1 * E) + ' ' + f2(-0.37 * E) + ' ' + f2(-0.08 * E) + ' ' + f2(-0.38 * E) + ' ' + f2(-0.03 * E) }, outline);
        [outline, fill].forEach((g) => {
          body.forEach(([cx, cy, cr]) => svgEl('circle', { cx: f2(cx * E), cy: f2(cy * E), r: f2(cr * E) }, g));
          svgEl('rect', { x: f2(-0.22 * E), y: 0, width: f2(0.49 * E), height: f2(0.1 * E) }, g);
        });
        [[-0.06, 0.34], [0.02, 0.5], [0.08, 0.26]].forEach(([y, len]) =>
          svgEl('path', { class: 'hair', d: 'M' + f2(-0.56 * E) + ' ' + f2(y * E) + 'L' + f2((-0.56 - len) * E) + ' ' + f2(y * E) }, trail));
        const CY = -0.85 * E, CX = 0.12 * E;                // above the ascenders of the word, then just past the period
        const SEAT = { x: -0.05 * E, y: -0.21 * E - r.rr };
        const x0 = -(r.vx + 0.9 * E), xOut = window.innerWidth - r.vx + 0.9 * E;
        const st = { cx: x0, cy: CY, bob: 0, dip: 0, spd: 1, hop: 0, sx: 1, sy: 1 };
        // the hop is a real arc: a short rise off the cloud, then gravity down to the baseline
        const T = 0.5, rise = 0.1 * E;
        let hx = 0, hy = 0, g = 0, v0 = 0;
        const launch = () => {
          hx = CX + SEAT.x; hy = CY + SEAT.y;
          const s = (Math.sqrt(2 * rise) + Math.sqrt(2 * rise - 2 * hy)) / T;
          g = s * s; v0 = Math.sqrt(2 * g * rise);
        };
        const render = () => {
          const cy = st.cy - 0.025 * E * st.bob + 0.035 * E * st.dip;
          cloud.setAttribute('transform', 'translate(' + f2(st.cx) + ' ' + f2(cy) + ')');
          trail.setAttribute('transform', 'translate(' + f2(st.cx) + ' ' + f2(cy) + ') translate(' + f2(-0.56 * E) + ' 0) scale(' + f2(Math.max(0.001, st.spd)) + ' 1) translate(' + f2(0.56 * E) + ' 0)');
          trail.setAttribute('opacity', f2(Math.min(1, st.spd * 2.5)));
          if (st.hop > 0) {
            const t = st.hop * T;
            place(r.dot, hx * (1 - st.hop), hy - v0 * t + 0.5 * g * t * t, st.sx, st.sy);
          } else {
            place(r.dot, st.cx + SEAT.x, cy + SEAT.y, st.sx, st.sy);
          }
        };
        const tl = gsap.timeline({ onUpdate: render })
          .to(st, { cx: CX, duration: 1.05, ease: 'power4.out' }, 0)
          .to(st, { spd: 0, duration: 0.95, ease: 'power2.out' }, 0)
          .to(st, { bob: 1, duration: 0.3, ease: 'sine.inOut', yoyo: true, repeat: 1 }, 0.75)
          .to(st, { sy: 0.8, sx: 1.15, duration: 0.1, ease: 'power2.in' }, 1.35)      // crouch
          .call(launch, null, 1.45)
          .to(st, { hop: 1, duration: T, ease: 'none' }, 1.45)
          .to(st, { sy: 1.16, sx: 0.88, duration: 0.18, ease: 'power2.out' }, 1.45)  // stretch off the cloud
          .to(st, { sy: 1.08, sx: 0.94, duration: 0.3, ease: 'sine.inOut' }, 1.63)
          .to(st, { dip: 1, duration: 0.12, ease: 'power2.out' }, 1.45)              // the cloud gives under the push
          .to(st, { dip: 0, duration: 0.35, ease: 'sine.out' }, 1.57)
          .to(st, { cx: xOut, cy: CY - 0.55 * E, duration: 0.65, ease: 'power3.in' }, 1.62)
          .to(st, { spd: 1.2, duration: 0.5, ease: 'power2.in' }, 1.7);
        touchdown(tl, st, 1.45 + T, 1);
        render();
        return { tl, land: 1.45 + T, rest: 1.45 + T + 0.64 };
      },

      // floats down tied to a balloon; on the baseline the string lets go and the balloon rises away
      balloon(r) {
        const D = 2.3, S = 0.5 * E, RX = 0.16 * E, RY = 0.2 * E, KN = 0.035 * E;
        const string = svgEl('path', { class: 'hair soft' }, r.svg);
        const ball = svgEl('g', {}, r.svg);
        svgEl('path', { class: 'solid', d: 'M' + f2(-0.028 * E) + ' 0L' + f2(0.028 * E) + ' 0L0 ' + f2(-KN - 0.01 * E) + 'Z' }, ball);
        svgEl('ellipse', { class: 'solid', cx: 0, cy: f2(-KN - RY), rx: f2(RX), ry: f2(RY) }, ball);
        const hl = (a) => f2(0.66 * RX * Math.cos(a)) + ' ' + f2(-KN - RY + 0.66 * RY * Math.sin(a));
        svgEl('path', { class: 'hair soft', d: 'M' + hl(3.55) + 'A' + f2(0.66 * RX) + ' ' + f2(0.66 * RY) + ' 0 0 1 ' + hl(4.25) }, ball);
        const st = { op: 0, x: 0.32 * E, y: -1.45 * E, wv: 0, sx: 1, sy: 1, rel: 0, bx: 0, by: 0, bop: 1 };
        const render = () => {
          r.rig.style.opacity = st.op;
          place(r.dot, st.x, st.y, st.sx, st.sy);
          const tilt = 6 * Math.sin(st.wv * 0.45), rad = tilt * Math.PI / 180;
          const ax = st.x, ay = st.y - r.rr;                       // where the string meets the dot
          const kx = ax + S * Math.sin(rad) + st.bx, ky = ay - S * Math.cos(rad) + st.by;
          const hx = kx + 0.04 * E * Math.sin(st.wv * 0.8), hy = ky + S * 0.92;    // where its loose end hangs once let go
          const bx = ax + (hx - ax) * st.rel, by = ay + (hy - ay) * st.rel;
          const dx = kx - bx, dy = ky - by, len = Math.hypot(dx, dy) || 1, w = 0.035 * E * Math.sin(st.wv);
          const nx = -dy / len * w, ny = dx / len * w;
          string.setAttribute('d', 'M' + f2(bx) + ' ' + f2(by) + 'C' + f2(bx + dx * 0.33 + nx) + ' ' + f2(by + dy * 0.33 + ny) + ' ' + f2(bx + dx * 0.66 - nx) + ' ' + f2(by + dy * 0.66 - ny) + ' ' + f2(kx) + ' ' + f2(ky));
          ball.setAttribute('transform', 'translate(' + f2(kx) + ' ' + f2(ky) + ') rotate(' + f2(tilt * 0.7) + ')');
          string.setAttribute('opacity', f2(st.bop));
          ball.setAttribute('opacity', f2(st.bop));
        };
        const tl = gsap.timeline({ onUpdate: render })
          .to(st, { op: 1, duration: 0.4, ease: 'power1.out' }, 0)
          .to(st, { x: 0, y: 0, duration: D, ease: 'sine.inOut' }, 0)
          .to(st, { wv: 16, duration: D + 1.7, ease: 'none' }, 0)
          .to(st, { rel: 1, duration: 0.45, ease: 'power2.out' }, D + 0.25)
          .to(st, { by: -2.4 * E, duration: 1.5, ease: 'power1.in' }, D + 0.15)
          .to(st, { bx: 0.3 * E, duration: 1.5, ease: 'sine.inOut' }, D + 0.15)
          .to(st, { bop: 0, duration: 0.6, ease: 'power1.in' }, D + 1.0);
        touchdown(tl, st, D, 0.3);
        render();
        return { tl, land: D, rest: D + 0.64 };
      },

      // a nod to the security half: the point is locked on, decrypts in a few broken frames, and snaps solid
      glitch(r) {
        const ghosts = [0, 1].map((i) => {
          const g = document.createElement('span');
          g.className = 'intro-dot is-ghost' + (i ? ' is-fog' : '');
          r.rig.insertBefore(g, r.dot);
          return g;
        });
        const B = r.rr + 0.03 * E, arm = 0.05 * E;          // tight enough to stay clear of the g
        const brk = svgEl('g', {}, r.svg);
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) =>
          svgEl('path', { class: 'hair', d: 'M' + f2(a * B) + ' ' + f2(b * (B - arm)) + 'L' + f2(a * B) + ' ' + f2(b * B) + 'L' + f2(a * (B - arm)) + ' ' + f2(b * B) }, brk));
        const scan = svgEl('path', { class: 'hair soft', d: 'M' + f2(-0.15 * E) + ' 0L' + f2(0.15 * E) + ' 0' }, r.svg);
        const st = { bs: 1.5, bop: 0, scy: -0.2 * E, sop: 0, sx: 1, sy: 1, op: 0 };
        const render = () => {
          brk.setAttribute('transform', 'scale(' + f2(st.bs) + ')');
          brk.setAttribute('opacity', f2(st.bop));
          scan.setAttribute('transform', 'translate(0 ' + f2(st.scy) + ')');
          scan.setAttribute('opacity', f2(st.sop));
          place(r.dot, 0, 0, st.sx, st.sy);
          r.dot.style.opacity = st.op;
        };
        const tl = gsap.timeline({ onUpdate: render })
          .to(st, { bop: 1, duration: 0.18, ease: 'power1.out' }, 0)
          .to(st, { bs: 1.12, duration: 0.4, ease: 'power3.out' }, 0)
          .to(st, { sop: 0.8, duration: 0.05 }, 0.3)
          .to(st, { scy: 0.2 * E, duration: 0.4, ease: 'power1.inOut' }, 0.3)
          .to(st, { sop: 0, duration: 0.15 }, 0.62);
        // broken frames at 24 fps, calming down as they go
        const n = 13, t0 = 0.32;
        for (let i = 0; i < n; i++) {
          const q = i / (n - 1), k = 1 - q * 0.8, t = t0 + i / 24;
          const solid = Math.random() < 0.3 + 0.5 * q;
          tl.set(st, { op: solid ? 1 : (Math.random() < 0.5 ? 0 : 0.35) }, t);
          ghosts.forEach((g) => {
            const top = Math.random() * 60, h = 12 + Math.random() * 35;
            tl.set(g, { x: (Math.random() * 2 - 1) * 0.12 * E * k, clipPath: 'inset(' + f2(top) + '% 0 ' + f2(Math.max(0, 100 - top - h)) + '% 0)', opacity: Math.random() < 0.7 ? 1 : 0 }, t);
          });
        }
        const T = t0 + n / 24;
        tl.set(st, { op: 1 }, T).set(ghosts, { opacity: 0 }, T)
          .to(st, { bs: 1, duration: 0.18, ease: 'power3.out' }, T)
          .to(st, { bop: 0, duration: 0.3, ease: 'power1.in' }, T + 0.22);
        touchdown(tl, st, T, 0.3);
        render();
        return { tl, land: T, rest: T + 0.64 };
      },

      // rolls in along the baseline from the edge of the screen, runs a touch past, and rocks back into place
      roll(r) {
        const T1 = 1.15, XE = -0.05 * E, x0 = window.innerWidth - r.vx + r.rr + 0.05 * E;
        const trail = svgEl('g', { class: 'soft' }, r.svg);
        const l1 = svgEl('path', { class: 'hair' }, trail), l2 = svgEl('path', { class: 'hair' }, trail);
        const st = { u: 0, rb: 0, sx: 1, sy: 1 };
        const render = () => {
          let x, v = 0;
          if (st.rb > 0) x = XE * (1 - st.rb);
          else { const w = 1 - st.u; x = x0 + (XE - x0) * (1 - w * w * w); v = (x0 - XE) * 3 * w * w / T1; }
          const s = Math.min(0.16, v / E * 0.022);                 // stretched by its own speed
          place(r.dot, x, 0, (1 + s) * st.sx, (1 - s * 0.6) * st.sy);
          const len = Math.min(1.1 * E, v * 0.11), sx0 = x + r.rr * (1 + s) + 0.06 * E;
          l1.setAttribute('d', 'M' + f2(sx0) + ' ' + f2(-0.4 * r.rr) + 'L' + f2(sx0 + len) + ' ' + f2(-0.4 * r.rr));
          l2.setAttribute('d', 'M' + f2(sx0 + 0.04 * E) + ' ' + f2(0.4 * r.rr) + 'L' + f2(sx0 + 0.04 * E + len * 0.6) + ' ' + f2(0.4 * r.rr));
          trail.setAttribute('opacity', len > 1 ? 1 : 0);
        };
        const tl = gsap.timeline({ onUpdate: render })
          .to(st, { u: 1, duration: T1, ease: 'none' }, 0)
          .to(st, { rb: 1, duration: 0.42, ease: 'sine.inOut' }, T1)
          .to(st, { sx: 1.06, sy: 0.95, duration: 0.08, ease: 'power2.in' }, T1 + 0.42)
          .to(st, { sx: 1, sy: 1, duration: 0.5, ease: 'elastic.out(1.1, 0.45)' }, T1 + 0.5);
        render();
        return { tl, land: T1, rest: T1 + 1.0 };
      },

      // a ninja's entrance: a little bomb is lobbed in from off the right and hits the baseline
      // where the period belongs. a burst of smoke, drawn as outlined puffs that spread, rise and
      // thin out, and when it clears the dot is simply there
      smoke(r) {
        const bomb = svgEl('g', {}, r.svg);
        svgEl('circle', { class: 'solid', cx: 0, cy: 0, r: f2(0.045 * E) }, bomb);
        svgEl('path', { class: 'hair', d: 'M0 ' + f2(-0.04 * E) + 'Q' + f2(0.02 * E) + ' ' + f2(-0.11 * E) + ' ' + f2(0.08 * E) + ' ' + f2(-0.1 * E) }, bomb);   // the fuse
        const rays = svgEl('g', { class: 'soft' }, r.svg);
        const RAY = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => { const a = (i + 0.5) * Math.PI / 4; return { c: Math.cos(a), s: Math.sin(a), el: svgEl('path', { class: 'hair' }, rays) }; });
        // the smoke sits in front of the dot, so the dot is hidden until the puffs have spread.
        // the same outline trick as the cloud: every puff stroked at double weight, then filled
        // over, so the lot reads as one shape with one edge
        const front = svgEl('svg', { class: 'intro-svg', width: 1, height: 1, focusable: 'false' }, r.rig);
        const cloud = svgEl('g', {}, front);
        const outline = svgEl('g', { class: 'hair double' }, cloud), fill = svgEl('g', { class: 'cloud-fill' }, cloud);
        // angle, how far it travels, how big it grows: most of it goes up, two big ones sit over the dot at first
        const PUFF = [[-90, 0.3, 0.2], [-122, 0.34, 0.15], [-58, 0.38, 0.17], [-152, 0.26, 0.13], [-28, 0.32, 0.14], [180, 0.3, 0.16], [0, 0.34, 0.15], [150, 0.24, 0.12], [30, 0.27, 0.12], [-100, 0.12, 0.22], [-70, 0.16, 0.19]]
          .map(([deg, dist, rad]) => ({ c: Math.cos(deg * Math.PI / 180), s: Math.sin(deg * Math.PI / 180), dist: dist * E, rad: rad * E, d: 0, k: 0,
            els: [svgEl('circle', { cx: 0, cy: 0, r: 1 }, outline), svgEl('circle', { cx: 0, cy: 0, r: 1 }, fill)] }));
        const st = { bx: 0.95 * E, by: -1.05 * E, bop: 0, spin: 0, ray: 0, rop: 0, rise: 0, cop: 0, dot: 0.4, dop: 0 };
        const render = () => {
          bomb.setAttribute('transform', 'translate(' + f2(st.bx) + ' ' + f2(st.by) + ') rotate(' + f2(st.spin) + ')');
          bomb.setAttribute('opacity', f2(st.bop));
          const r0 = (0.06 + 0.34 * st.ray) * E, r1 = (0.12 + 0.5 * st.ray) * E;
          RAY.forEach((q) => q.el.setAttribute('d', 'M' + f2(q.c * r0) + ' ' + f2(q.s * r0) + 'L' + f2(q.c * r1) + ' ' + f2(q.s * r1)));
          rays.setAttribute('opacity', f2(st.rop));
          PUFF.forEach((p) => {
            const cx = f2(p.c * p.dist * p.d), cy = f2(p.s * p.dist * p.d - 0.3 * E * st.rise), rr = f2(Math.max(0.5, p.rad * (0.3 + 0.7 * p.k)));
            p.els.forEach((el) => { el.setAttribute('cx', cx); el.setAttribute('cy', cy); el.setAttribute('r', rr); });
          });
          cloud.setAttribute('opacity', f2(st.cop));
          place(r.dot, 0, 0, st.dot, st.dot);
          r.dot.style.opacity = st.dop;
        };
        const HIT = 0.52;
        const tl = gsap.timeline({ onUpdate: render })
          .set(st, { bop: 1 }, 0.1)
          .to(st, { bx: 0, duration: HIT - 0.1, ease: 'none' }, 0.1)
          .to(st, { by: 0, duration: HIT - 0.1, ease: 'power2.in' }, 0.1)      // lobbed in; gravity takes it down
          .to(st, { spin: 320, duration: HIT - 0.1, ease: 'none' }, 0.1)
          .set(st, { bop: 0, rop: 1, cop: 1 }, HIT)                             // impact
          .to(st, { ray: 1, duration: 0.3, ease: 'power3.out' }, HIT)
          .to(st, { rop: 0, duration: 0.3, ease: 'power1.in' }, HIT)
          .to(st, { rise: 1, duration: 1.1, ease: 'power1.out' }, HIT)
          .to(st, { cop: 0, duration: 0.5, ease: 'power1.in' }, HIT + 0.7)      // the smoke thins
          .set(st, { dop: 1 }, HIT + 0.22)
          .to(st, { dot: 1, duration: 0.55, ease: 'elastic.out(1, 0.5)' }, HIT + 0.22);
        PUFF.forEach((p, i) => tl.to(p, { d: 1, k: 1, duration: 0.95, ease: 'power3.out' }, HIT + i * 0.02));
        render();
        return { tl, land: HIT + 0.22, rest: HIT + 0.8 };
      },

      // a lift: a hairline car rises from under the word with the dot inside, an up-arrow over it,
      // and eases to a stop with its floor on the baseline. the doors slide apart into the walls,
      // the dot is there, and the car fades away around it
      elevator(r) {
        const CW = 0.34 * E, CH = 0.5 * E;                   // the car: just clear of the g, tall enough for the dot and some headroom
        const car = svgEl('g', {}, r.svg);
        svgEl('rect', { class: 'solid', x: f2(-CW / 2), y: f2(-CH), width: f2(CW), height: f2(CH) }, car);
        const arrow = svgEl('path', { class: 'hair', d: 'M' + f2(-0.035 * E) + ' ' + f2(-CH - 0.05 * E) + 'L0 ' + f2(-CH - 0.1 * E) + 'L' + f2(0.035 * E) + ' ' + f2(-CH - 0.05 * E) }, car);
        // the doors sit in front of the dot and are clipped to the car, so they slide out of sight into its walls
        const front = svgEl('svg', { class: 'intro-svg', width: 1, height: 1, focusable: 'false' }, r.rig);
        const doors = svgEl('g', {}, front);
        svgEl('rect', { x: f2(-CW / 2), y: f2(-CH), width: f2(CW), height: f2(CH) }, svgEl('clipPath', { id: 'intro-lift-doors' }, svgEl('defs', {}, doors)));
        const inner = svgEl('g', { 'clip-path': 'url(#intro-lift-doors)' }, doors);
        const dl = svgEl('rect', { class: 'solid', x: f2(-CW / 2), y: f2(-CH), width: f2(CW / 2), height: f2(CH) }, inner);
        const dr = svgEl('rect', { class: 'solid', x: 0, y: f2(-CH), width: f2(CW / 2), height: f2(CH) }, inner);
        const st = { y: 0.9 * E, dy: 0.9 * E, bob: 0, op: 0, open: 0, aop: 1, cop: 1 };
        const render = () => {
          const ty = 'translate(0 ' + f2(r.rr + st.y + st.bob) + ')';   // the car's floor sits on the baseline when y is 0
          car.setAttribute('transform', ty); doors.setAttribute('transform', ty);
          car.setAttribute('opacity', f2(st.cop)); doors.setAttribute('opacity', f2(st.cop));
          arrow.setAttribute('opacity', f2(st.aop));
          dl.setAttribute('transform', 'translate(' + f2(-st.open * CW / 2) + ' 0)');
          dr.setAttribute('transform', 'translate(' + f2(st.open * CW / 2) + ' 0)');
          r.rig.style.opacity = st.op;
          place(r.dot, 0, st.dy + st.bob, 1, 1);
        };
        const UP = 1.1;
        const tl = gsap.timeline({ onUpdate: render })
          .to(st, { op: 1, duration: 0.3, ease: 'power1.out' }, 0)
          .to(st, { y: 0, dy: 0, duration: UP, ease: 'power2.inOut' }, 0)          // the ride up: a lift's pull, then its ease into the stop
          .to(st, { bob: -0.03 * E, duration: 0.12, ease: 'power1.out' }, UP)      // the stop: everything carries on a touch
          .to(st, { bob: 0, duration: 0.3, ease: 'elastic.out(1, 0.5)' }, UP + 0.12)
          .to(st, { aop: 0, duration: 0.2, ease: 'power1.in' }, UP)                // the arrow goes out
          .to(st, { open: 1, duration: 0.45, ease: 'power2.inOut' }, UP + 0.25)   // the doors part
          .to(st, { cop: 0, duration: 0.45, ease: 'power1.in' }, UP + 0.95);      // and the car is simply gone
        render();
        return { tl, land: UP + 0.25, rest: UP + 0.8 };
      }
    };

    const names = Object.keys(INTROS);
    const query = new URLSearchParams(window.location.search);
    const asked = query.get('intro'), loop = query.has('loop');   // ?loop replays the entrance for review: the page reloads a moment after the dot lands
    const pick = INTROS.hasOwnProperty(asked) ? asked : names[Math.floor(Math.random() * names.length)];
    const rig = makeRig();
    const intro = INTROS[pick](rig);
    const boot = gsap.timeline();
    boot.add(intro.tl, 0);
    // the dot is at rest: the period comes back for one frame and hands over to the orb
    boot.call(() => {
      gsap.set(period, { clearProps: 'all' });
      if (rig) rig.dot.remove();
      takeover();
      introOver = true;
      if (fontsLate) dropKeeps();
      if (loop) setTimeout(() => window.location.reload(), 1500);
    }, null, intro.rest);
    if (rig) boot.call(() => rig.rig.remove(), null, Math.max(intro.rest, intro.tl.duration()) + 0.01);

    // type comes in as the dot lands: lines rise in masks
    const heroSplit = SplitText.create(heroLines, { type: 'lines', mask: 'lines', linesClass: 'ln' });
    gsap.set(heroLines, { autoAlpha: 1 });
    boot.from(heroSplit.lines, { yPercent: 110, duration: 0.9, ease: 'power3.out', stagger: 0.06 }, Math.max(0.6, intro.land - 0.8));
    boot.fromTo(heroReveal, { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power2.out', stagger: 0.08 }, '<0.3');

    // when scrolling stops near a section top, the page settles onto it. magnetic, not
    // automatic: only when the reader has stopped, only close to a stop, only ahead in the
    // direction they were going (a short way back is allowed), and it eases in from rest
    if (lenis) {
      let idle = null, settling = false, lastY = sy, dir = 1, lastInput = 0;
      const inOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
      const release = () => {                            // any hand on the page wins over the settle
        lastInput = performance.now();
        if (settling) { settling = false; lenis.scrollTo(lenis.scroll, { immediate: true, force: true }); }
      };
      window.addEventListener('wheel', () => { lastInput = performance.now(); settling = false; }, { passive: true });
      window.addEventListener('touchmove', () => { lastInput = performance.now(); }, { passive: true });
      ['touchstart', 'pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, release, { passive: true }));
      lenis.on('scroll', () => {
        if (Math.abs(sy - lastY) > 0.5) dir = sy > lastY ? 1 : -1;
        lastY = sy;
        if (settling) return;
        clearTimeout(idle);
        idle = setTimeout(() => {
          if (performance.now() - lastInput < 320) return;            // still scrolling
          const list = C.stops.concat(lenis.limit);
          let best = list[0]; list.forEach((v) => { if (Math.abs(v - sy) < Math.abs(best - sy)) best = v; });
          const delta = best - sy, dist = Math.abs(delta);
          const ahead = Math.sign(delta) === dir;
          if (dist > 2 && dist < (ahead ? C.vh * 0.12 : 40)) {
            settling = true;
            lenis.scrollTo(best, { duration: 0.95, easing: inOut, onComplete: () => { setTimeout(() => { settling = false; }, 80); } });
            setTimeout(() => { settling = false; }, 1600);           // never stay locked
          }
        }, 350);
      });
    }

    // everything measured once more whenever the layout settles: resize, late fonts, line masks
    ScrollTrigger.addEventListener('refresh', () => { placeGeoMarks(); sizeField(); measure(); });
    ScrollTrigger.refresh();
  }
})();
