(function () {
  'use strict';

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------------
     brief form: compose a mailto, nothing leaves the page otherwise.
     each page carries its own wording on the form's data attributes.
     ------------------------------------------------------------------ */
  const form = document.getElementById('form');
  const note = document.getElementById('form-note');
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
    window.location.href = 'mailto:info@flt.pt?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    note.textContent = form.dataset.handed;
  });

  /* ------------------------------------------------------------------
     the line: 30° w to 45° e, a tick every 5 degrees, a taller one every 15
     ------------------------------------------------------------------ */
  const geoMarkEl = document.getElementById('geo-mark'), geoHost = document.getElementById('geo');
  const placeGeoMark = () => { geoMarkEl.style.left = (Math.round(geoHost.clientWidth * 0.2847) + 0.5) + 'px'; };
  placeGeoMark();
  window.addEventListener('resize', placeGeoMark);

  const ticksEl = document.getElementById('geo-ticks');
  for (let deg = -30; deg <= 45; deg += 5) {
    const t = document.createElement('span');
    t.className = 'geo-tick' + (deg % 15 === 0 ? ' major' : '');
    t.style.left = ((deg + 30) / 75 * 100) + '%';
    ticksEl.appendChild(t);
  }

  /* ------------------------------------------------------------------
     header hairline
     ------------------------------------------------------------------ */
  const header = document.getElementById('header');
  function onScroll(y) { header.classList.toggle('is-scrolled', y > 8); }
  window.addEventListener('scroll', () => onScroll(window.scrollY), { passive: true });

  /* ------------------------------------------------------------------
     motion. all of it is skipped under prefers-reduced-motion.
     ------------------------------------------------------------------ */
  if (reduced || !window.gsap) return;
  gsap.registerPlugin(ScrollTrigger, SplitText);

  // smooth scroll
  let lenis = null;
  if (window.Lenis) {
    lenis = new Lenis({ lerp: 0.14, smoothWheel: true });
    lenis.on('scroll', (e) => { ScrollTrigger.update(); onScroll(e.scroll); });
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
  const fieldHost = document.getElementById('services');
  const canvas = document.getElementById('field');
  const ctx = canvas.getContext('2d');
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const field = { w: 0, h: 0, dpr: 1, p: 0, mx: 0, my: 0, tx: 0, ty: 0, dots: [], t: 0, k: -1 };

  function sizeField() {
    const r = fieldHost.getBoundingClientRect();
    field.dpr = Math.min(2, window.devicePixelRatio || 1);
    field.w = r.width; field.h = r.height;
    canvas.width = Math.round(r.width * field.dpr);
    canvas.height = Math.round(r.height * field.dpr);
    ctx.setTransform(field.dpr, 0, 0, field.dpr, 0, 0);
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
      const z = [0.35, 0.65, 1][i % 3];
      field.dots.push({
        x: prev ? prev.x : Math.random(), y: prev ? prev.y : Math.random(), z,
        gx: ox + (i % cols) * cell, gy: oy + Math.floor(i / cols) * cell,
        r: 0.9 + z * 1.5, a: 0.12 + z * 0.26,
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
  const smooth = (u) => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };
  function drawField(dt) {
    field.t += dt;
    field.mx += (field.tx - field.mx) * 0.06;
    field.my += (field.ty - field.my) * 0.06;
    const p = field.p;
    const k = smooth((p - 0.25) / 0.45);          // scatter -> grid through the middle of the section
    const fade = smooth(p / 0.12) * (1 - smooth((p - 0.9) / 0.1));
    ctx.clearRect(0, 0, field.w, field.h);
    ctx.fillStyle = '#2a2730';
    field.dots.forEach((d, i) => {
      d.x += d.vx * dt; if (d.x < -0.02) d.x = 1.02; if (d.x > 1.02) d.x = -0.02;
      const wob = Math.sin(field.t * d.sp * 60 + d.ph) * d.amp;
      const fx = (d.x + wob) * field.w + field.mx * d.z * 26;
      const fy = (d.y + wob * 0.6) * field.h + field.my * d.z * 16 - (p - 0.5) * 140 * d.z;
      d.px = fx + (d.gx + field.mx * 8 - fx) * k;
      d.py = fy + (d.gy - fy) * k;
      if (i === field.k) return;                       // the point sits here
      const a = d.a * fade * (1 - k * 0.35);
      if (a <= 0.005) return;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(d.px, d.py, d.r * (1 - k * 0.3), 0, Math.PI * 2);
      ctx.fill();
    });
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
  window.addEventListener('resize', () => { sizeField(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { sizeField(); ScrollTrigger.refresh(); });
  gsap.timeline({ scrollTrigger: { trigger: '.offers', start: 'top 78%', once: true } })
    .from('.mark-dot', { scale: 0, duration: 0.6, ease: 'back.out(2)', stagger: 0.15 }, 0)
    ;   // the shell around it is drawn in webgl, further down
  const servicesText = fieldHost.querySelector('.wrap');
  gsap.timeline({
    scrollTrigger: {
      trigger: fieldHost, start: 'top bottom', end: 'bottom top', scrub: 0.4,
      onUpdate: (st) => { field.p = st.progress; }, onRefresh: sizeField
    }
  })
    .fromTo(servicesText, { opacity: 0, scale: 0.94, y: 60 }, { opacity: 1, scale: 1, y: 0, ease: 'none', duration: 0.28 }, 0.02)
    .to(servicesText, { opacity: 0, scale: 0.62, y: -80, transformOrigin: '50% 30%', ease: 'none', duration: 0.3 }, 0.68);

  // the bounce. brand physics: gravity 2800, restitution 0.78, friction 0.78,
  // integrated at load and played once. values in em of the wordmark.
  function simulateBounce(scale) {
    const o = {
      holdBefore: 0.25, shortAntDur: 0.12, finalAntDur: 0.36, anticipationSquashY: 0.42,
      startX: -640 * scale, startY: -200 * scale, launchVx: 490 * scale,
      gravity: 2800 * scale, restitution: 0.78, friction: 0.78, fps: 120, maxBounces: 4,
      settleThreshold: 80 * scale, impactSquashFloor: 0.5,
      stretchPerVel: 0.00055 / scale, impactSquashCoef: 0.00045 / scale, settleDur: 0.3,
    };
    const S = [];
    S.push({ t: 0, x: o.startX, y: o.startY, sx: 1, sy: 1, op: 0 });
    S.push({ t: o.holdBefore - 0.001, x: o.startX, y: o.startY, sx: 1, sy: 1, op: 0 });
    let t = o.holdBefore, dt = 1 / o.fps;
    let x = o.startX, y = o.startY, vx = o.launchVx, vy = 0, bounces = 0, done = false;
    while (!done && t < 12) {
      vy += o.gravity * dt; x += vx * dt; y += vy * dt;
      if (y >= 0) {
        y = 0;
        const imp = Math.abs(vy);
        const syI = Math.max(o.impactSquashFloor, 1 - imp * o.impactSquashCoef);
        S.push({ t, x, y: 0, sx: 1 + (1 - syI) * 0.7, sy: syI, op: 1 });
        vy = -imp * o.restitution; vx *= o.friction; bounces++;
        if (Math.abs(vy) < o.settleThreshold || bounces >= o.maxBounces) { done = true; continue; }
        const finalWind = bounces === o.maxBounces - 1;
        const antDur = finalWind ? o.finalAntDur : o.shortAntDur;
        const deep = Math.max(o.anticipationSquashY, syI - (finalWind ? 0.12 : 0.05));
        const n = Math.round(antDur * o.fps);
        for (let i = 1; i <= n; i++) {
          const u = i / n;
          const e = finalWind ? u * u : (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
          const sy = syI + (deep - syI) * e;
          S.push({ t: t + antDur * u, x, y: 0, sx: 1 + (1 - sy) * 0.7, sy, op: 1 });
        }
        t += antDur;
        S.push({ t, x, y: 0, sx: 0.85, sy: 1.18, op: 1 });
        continue;
      }
      const sy = 1 + Math.abs(vy) * o.stretchPerVel;
      S.push({ t, x, y, sx: 2 - sy, sy, op: 1 });
      t += dt;
    }
    const last = S[S.length - 1];
    const n = Math.round(o.settleDur * o.fps);
    for (let j = 1; j <= n; j++) {
      const u = j / n, e = 1 - Math.pow(1 - u, 3);
      S.push({ t: t + o.settleDur * u, x: last.x * (1 - e), y: 0, sx: last.sx + (1 - last.sx) * e, sy: last.sy + (1 - last.sy) * e, op: 1 });
    }
    t += o.settleDur;
    S.push({ t, x: 0, y: 0, sx: 1, sy: 1, op: 1 });
    return { samples: S, duration: t };
  }

  const period = document.getElementById('period');
  const h1 = period.parentElement;
  const fs = parseFloat(getComputedStyle(h1).fontSize) || 160;
  const sim = simulateBounce(fs / 160);
  const boot = gsap.timeline();

  gsap.set(period, { opacity: 0, x: sim.samples[0].x, y: sim.samples[0].y });
  boot.to({ p: 0 }, {
    p: 1, duration: sim.duration, ease: 'none',
    onUpdate() {
      const tt = this.progress() * sim.duration;
      const S = sim.samples;
      let i = 1;
      while (i < S.length - 1 && S[i].t < tt) i++;
      const a = S[i - 1], b = S[i];
      const u = b.t === a.t ? 1 : Math.min(1, Math.max(0, (tt - a.t) / (b.t - a.t)));
      const mix = (k) => a[k] + (b[k] - a[k]) * u;
      gsap.set(period, { x: mix('x'), y: mix('y'), scaleX: mix('sx'), scaleY: mix('sy'), opacity: mix('op') });
    },
    onComplete() { gsap.set(period, { clearProps: 'all' }); if (window.__orbTakeover) window.__orbTakeover(); }
  }, 0);

  // type comes in after the dot lands: lines rise in masks
  const splitTargets = document.querySelectorAll('.hero [data-lines]');
  const heroSplit = SplitText.create(splitTargets, { type: 'lines', mask: 'lines', linesClass: 'ln' });
  boot.from(heroSplit.lines, { yPercent: 110, duration: 0.9, ease: 'power3.out', stagger: 0.06 }, Math.max(0.6, sim.duration - 0.8));
  boot.from(document.querySelectorAll('.hero [data-reveal]'), { opacity: 0, y: 8, duration: 0.6, ease: 'power2.out', stagger: 0.08 }, '<0.3');

  // section heads: the rule under the heading draws once
  document.querySelectorAll('.section-head').forEach((head) => {
    gsap.from(head, {
      scrollTrigger: { trigger: head, start: 'top 85%', once: true },
      opacity: 0, y: 10, duration: 0.7, ease: 'power2.out'
    });
  });

  // method: the dot is the status indicator. it sits on the step you are reading
  // and hops to whichever step you hover, with the brand's squash and stretch.
  const steps = gsap.utils.toArray('.step');
  const stepsEl = document.getElementById('steps');
  const marker = document.getElementById('marker');
  const track = stepsEl.querySelector('.track');
  gsap.set(marker, { xPercent: -50, yPercent: -50, transformOrigin: '50% 100%' });
  let scrollStep = steps[0], hoverStep = null, hop = null;
  function stepY(step) {
    const h = step.querySelector('h3').getBoundingClientRect();
    return h.top + h.height / 2 - track.getBoundingClientRect().top;
  }
  function markerTo(step, animate) {
    steps.forEach(x => x.classList.toggle('is-active', x === step));
    if (window.__orbStep) { window.__orbStep(step, animate); return; }
    const y = stepY(step);
    if (hop) hop.kill();
    if (!animate) { gsap.set(marker, { top: y, scaleX: 1, scaleY: 1 }); return; }
    const dist = Math.abs(y - parseFloat(gsap.getProperty(marker, 'top')));
    const dur = gsap.utils.clamp(0.35, 0.7, dist / 500);
    hop = gsap.timeline()
      .to(marker, { scaleY: 0.72, scaleX: 1.22, duration: 0.1, ease: 'power2.in' }, 0)          // anticipation
      .to(marker, { top: y, duration: dur, ease: 'power2.inOut' }, 0.1)                           // travel
      .to(marker, { scaleY: 1.3, scaleX: 0.84, duration: dur * 0.5, ease: 'power2.out' }, 0.1)  // stretch in flight
      .to(marker, { scaleY: 0.6, scaleX: 1.35, duration: 0.09, ease: 'power2.in' }, 0.1 + dur)  // impact
      .to(marker, { scaleY: 1, scaleX: 1, duration: 0.5, ease: 'elastic.out(1.1, 0.45)' }, 0.19 + dur);
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
  ScrollTrigger.addEventListener('refresh', () => markerTo(hoverStep || scrollStep, false));

  // studio: statement lines rise on ink
  const darkSplit = SplitText.create('[data-lines-dark]', { type: 'lines', mask: 'lines' });
  gsap.from(darkSplit.lines, {
    scrollTrigger: { trigger: '.studio', start: 'top 70%', once: true },
    yPercent: 110, duration: 0.9, ease: 'power3.out', stagger: 0.07
  });

  // studio: the line draws across, then the aveiro mark lands on it
  const DRAW = 2.2;
  gsap.timeline({ scrollTrigger: { trigger: '#geo', start: 'top 92%', end: 'top 55%', scrub: 0.6 } })
    .from('#geo-line', { scaleX: 0, duration: DRAW, ease: 'power2.inOut' }, 0)
    .from('.geo-tick', { scaleY: 0, opacity: 0, duration: 0.5, ease: 'power2.out',
      stagger: { each: DRAW / 16, ease: 'power2.inOut' } }, 0.05)
    .from('#geo-mark .geo-dot', { y: -40, opacity: 0, scaleY: 1.3, scaleX: 0.8, duration: 0.55, ease: 'power2.in' }, DRAW * 0.2847 + 0.05)
    .to('#geo-mark .geo-dot', { scaleY: 0.78, scaleX: 1.22, duration: 0.1, ease: 'power2.in' }, '>')
    .to('#geo-mark .geo-dot', { scaleY: 1, scaleX: 1, duration: 0.6, ease: 'elastic.out(1.1, 0.45)' }, '>')
    .from('#geo-mark .geo-stem', { scaleY: 0, duration: 0.5, ease: 'power2.out' }, '<0.05')
    .from('#geo-mark .geo-label', { opacity: 0, y: 8, duration: 0.7, ease: 'power2.out' }, '<0.15');

  // brief form: fields settle in
  gsap.from('.form .field, .form .form-actions', {
    scrollTrigger: { trigger: '.form', start: 'top 80%', once: true },
    opacity: 0, y: 10, duration: 0.6, stagger: 0.06, ease: 'power2.out'
  });

  // re-split on resize so masks match the new line breaks
  gsap.to('#geo', { opacity: 0, ease: 'none', scrollTrigger: { trigger: '#geo', start: 'top 28%', end: 'top 6%', scrub: true } });

  /* ------------------------------------------------------------------
     the point. the period of "floating." is where it starts: the bounce
     lands and the orb takes the dot's place. from there one orb on a fixed
     canvas travels the page: a dot in the field, the marker on the method
     track, the aveiro mark on the line, the period of the last heading.
     ------------------------------------------------------------------ */
  if (window.THREE) {
    const PAPER = 0xe0dfd4;   // paper minus ink: under the difference blend this reads as ink on paper
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const orbCanvas = document.getElementById('orb');
    const orbR = new THREE.WebGLRenderer({ canvas: orbCanvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    orbR.setPixelRatio(dpr); orbR.setClearColor(0x000000, 0);
    const orbScene = new THREE.Scene();
    const orbCam = new THREE.PerspectiveCamera(32, 1, 0.1, 60); orbCam.position.z = 9;
    const fit = () => { const w = orbCanvas.clientWidth || 1, h = orbCanvas.clientHeight || 1; orbR.setSize(w, h, false); orbCam.aspect = w / h; orbCam.updateProjectionMatrix(); };
    const orb = new THREE.Group(); orbScene.add(orb);
    const R = 1.7;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 48), new THREE.MeshBasicMaterial({ color: PAPER, transparent: true, opacity: 0 })); orb.add(dot);
    fit();
    const CW = () => orbCanvas.clientWidth || 1, CH = () => orbCanvas.clientHeight || 1;
    const vhWorld = () => 2 * orbCam.position.z * Math.tan(orbCam.fov * Math.PI / 360);
    const pxPerUnit = () => CH() / vhWorld();
    const scaleForPx = (d) => d / (2 * R * pxPerUnit());   // scale so the sphere spans d pixels

    const o = { x: 0.5, y: 0.5, s: 0.1, gx: 0.5, gy: 0.5, gs: 0.1, section: 'hero', follow: null, k: 0.6, hop: null, took: false };
    const rectOf = (el) => el.getBoundingClientRect();
    const last = { x: -1, y: -1, s: -1, o: -1, v: null };
    const orbVisibleNow = () => dot.visible;
    const FOLLOW = {
      period: () => { const r = rectOf(period); return { x: r.left + r.width / 2, y: r.top + r.height / 2, s: scaleForPx(r.width) }; },
      field:  () => { const r = rectOf(fieldHost), d = field.dots[field.k]; return { x: r.left + d.px, y: r.top + d.py, s: scaleForPx(STATES.services.px) }; },
      // the marker on the method track, level with the current step's title
      step:   () => { const tr = rectOf(track), h = rectOf((hoverStep || scrollStep).querySelector('h3')); return { x: tr.left + tr.width / 2, y: h.top + h.height / 2, s: scaleForPx(12) }; },
      geo:    () => { const r = rectOf(document.querySelector('.geo-dot')); return { x: r.left + r.width / 2, y: r.top + r.height / 2, s: scaleForPx(r.width) }; },
      bdot:   () => { const r = rectOf(document.getElementById('brief-dot')); return { x: r.left + r.width / 2, y: r.top + r.height / 2, s: scaleForPx(r.width) }; }
    };
    const setTarget = (t) => { o.gx = t.x / CW(); o.gy = t.y / CH(); o.gs = t.s; };
    setTarget(FOLLOW.period()); o.x = o.gx; o.y = o.gy; o.s = o.gs;

    // the bounce lands: the orb is placed exactly on the dot and the two swap in one frame
    window.__orbTakeover = () => {
      setTarget(FOLLOW.period()); o.x = o.gx; o.y = o.gy; o.s = o.gs;
      orb.position.set((o.x - 0.5) * vhWorld() * orbCam.aspect, (0.5 - o.y) * vhWorld(), 0); orb.scale.set(o.s, o.s, o.s);
      dot.material.opacity = 1; dot.material.transparent = false;
      orbR.render(orbScene, orbCam);
      period.style.opacity = '0';
      o.took = true;
    };

    // the dom marker steps aside; the orb hops along the track instead, squash and stretch included
    gsap.set(marker, { opacity: 0 });
    window.__orbStep = (step, animate) => {
      if (o.section !== 'method' || !animate) return;
      const from = { x: o.x, y: o.y }, t = FOLLOW.step();
      const to = { x: t.x / CW(), y: t.y / CH() };
      if (Math.abs(to.y - from.y) < 0.002) return;
      o.hop = { u: 0, from, to };
      const dur = gsap.utils.clamp(0.35, 0.7, Math.abs(to.y - from.y) * window.innerHeight / 500);
      gsap.timeline({ onComplete() { o.hop = null; } })
        .to(orb.scale, { y: () => o.s * 0.72, x: () => o.s * 1.22, duration: 0.1, ease: 'power2.in' }, 0)
        .to(o.hop, { u: 1, duration: dur, ease: 'power2.inOut' }, 0.1)
        .to(orb.scale, { y: () => o.s * 1.3, x: () => o.s * 0.84, duration: dur * 0.5, ease: 'power2.out' }, 0.1)
        .to(orb.scale, { y: () => o.s * 0.6, x: () => o.s * 1.35, duration: 0.09, ease: 'power2.in' }, 0.1 + dur)
        .to(orb.scale, { y: () => o.s, x: () => o.s, duration: 0.5, ease: 'elastic.out(1.1, 0.45)' }, 0.19 + dur);
    };

    // the cybersecurity mark: the same icosahedron the point is built from, turning around it.
    // it shares this canvas, so it costs no second webgl context.
    const cyber = document.getElementById('cyber-mark');
    const cyberWire = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(R, 0)),   // 30 edges: legible at mark size
      new THREE.LineBasicMaterial({ color: PAPER, transparent: true, opacity: 0 }));
    cyberWire.userData.total = cyberWire.geometry.attributes.position.count;
    cyberWire.geometry.setDrawRange(0, 0);
    orbScene.add(cyberWire);
    let cyberOn = false;
    new IntersectionObserver((es) => { cyberOn = es[0].isIntersecting; }).observe(cyber);
    const cw = { d: 0 };
    gsap.timeline({ scrollTrigger: { trigger: '.offers', start: 'top 78%', once: true } })
      .to(cyberWire.material, { opacity: 0.9, duration: 0.9, ease: 'power2.out' }, 0.6)
      .to(cw, { d: 1, duration: 4.5, ease: 'power1.inOut',
        onUpdate() { cyberWire.geometry.setDrawRange(0, Math.floor(cyberWire.userData.total * cw.d)); } }, 0.5);

    const STATES = {
      hero:     { follow: 'period', k: 0.6 },
      services: { follow: 'field',  k: 0.12, px: 5, alpha: 0.4 },
      method:   { follow: 'step',   k: 0.3 },
      studio:   { follow: 'geo',    k: 0.2 },
      brief:    { follow: 'bdot',   k: 0.2 },
      footer:   { follow: 'bdot',   k: 0.3 }
    };
    function applyState(name) {
      const st = STATES[name] || STATES.hero;
      o.section = name; o.follow = st.follow; o.k = st.k; o.hop = null;
      // in the field the point is one of the dots: as faint as its neighbours
      if (o.took) gsap.to(dot.material, { opacity: st.alpha === undefined ? 1 : st.alpha, duration: 1.0, ease: 'power2.inOut' });
    }
    // the current section is the last one whose top has passed the 55% line; at the top that is the hero
    const sectionEls = Array.from(document.querySelectorAll('[data-orb]'));
    function currentSection() {
      const line = window.innerHeight * 0.55;
      let cur = 'hero';
      sectionEls.forEach((el) => { if (el.getBoundingClientRect().top <= line) cur = el.dataset.orb; });
      return cur;
    }

    gsap.ticker.add((t) => {
      const cur = currentSection(); if (cur !== o.section) applyState(cur);
      if (o.follow && !o.hop) setTarget(FOLLOW[o.follow]());
      if (o.hop) {
        const u = o.hop.u;
        o.x = o.hop.from.x + (o.hop.to.x - o.hop.from.x) * u;
        o.y = o.hop.from.y + (o.hop.to.y - o.hop.from.y) * u;
      } else {
        o.x += (o.gx - o.x) * o.k; o.y += (o.gy - o.y) * o.k; o.s += (o.gs - o.s) * o.k;
      }
      const vh = vhWorld(), vw = vh * orbCam.aspect;
      // the shell turns slowly over the cybersecurity mark: about a revolution a minute
      cyberWire.visible = cyberOn && cyberWire.material.opacity > 0.01;
      if (cyberWire.visible) {
        const r = cyber.getBoundingClientRect(), cs = scaleForPx(84);
        cyberWire.position.set(((r.left + r.width / 2) / CW() - 0.5) * vw, (0.5 - (r.top + r.height / 2) / CH()) * vh, 0);
        cyberWire.scale.set(cs, cs, cs);
        cyberWire.rotation.y = t * 0.026; cyberWire.rotation.x = 0.42;   // about four minutes a turn, and frame-rate independent
      }
      orb.position.set((o.x - 0.5) * vw, (0.5 - o.y) * vh, 0);
      if (!gsap.isTweening(orb.scale)) orb.scale.set(o.s, o.s, o.s); else orb.scale.z = o.s;
      dot.visible = o.took && dot.material.opacity > 0.01;
      dot.material.transparent = dot.material.opacity < 0.999;
      // draw only when something moved
      const moved = Math.abs(o.x - last.x) > 1e-5 || Math.abs(o.y - last.y) > 1e-5 || Math.abs(o.s - last.s) > 1e-5 || Math.abs(dot.material.opacity - last.o) > 1e-3 || cyberWire.visible || gsap.isTweening(orb.scale) || last.v !== orbVisibleNow();
      if (moved) { orbR.render(orbScene, orbCam); last.x = o.x; last.y = o.y; last.s = o.s; last.o = dot.material.opacity; last.v = orbVisibleNow(); }
    });
    window.addEventListener('resize', fit);

    // when scrolling stops near a section top, the page settles onto it
    if (lenis) {
      const stopEls = ['#services', '#method', '#studio', '#brief'].map((q) => document.querySelector(q));
      const stops = () => [0, ...stopEls.map((el) => el.getBoundingClientRect().top + window.scrollY - 64), document.documentElement.scrollHeight - window.innerHeight];
      // magnetic, not automatic: only when the reader has stopped, only near a stop, and only
      // ahead in the direction they were going (a short way back is allowed)
      let idle = null, settling = false, lastY = window.scrollY, dir = 1, lastInput = 0;
      ['wheel', 'touchmove', 'keydown'].forEach((ev) => window.addEventListener(ev, () => { lastInput = performance.now(); }, { passive: true }));
      lenis.on('scroll', () => {
        const y = window.scrollY;
        if (Math.abs(y - lastY) > 0.5) dir = y > lastY ? 1 : -1;
        lastY = y;
        if (settling) return;
        clearTimeout(idle);
        idle = setTimeout(() => {
          if (performance.now() - lastInput < 260) return;            // still scrolling
          const list = stops();
          let best = list[0]; list.forEach((v) => { if (Math.abs(v - y) < Math.abs(best - y)) best = v; });
          const delta = best - y, dist = Math.abs(delta);
          const ahead = Math.sign(delta) === dir;
          if (dist > 2 && dist < (ahead ? window.innerHeight * 0.22 : 72)) {
            settling = true;
            lenis.scrollTo(best, { duration: 0.7, easing: (u) => 1 - Math.pow(1 - u, 3), onComplete: () => { setTimeout(() => { settling = false; }, 80); } });
            setTimeout(() => { settling = false; }, 1400);           // never stay locked if the reader interrupts
          }
        }, 220);
      });
    }
  }

  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => ScrollTrigger.refresh(), 150); });
})();
