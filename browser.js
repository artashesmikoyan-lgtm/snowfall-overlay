(() => {
'use strict';
const COLUMN = 4;
const MAX_PARTICLES = 500;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function createSnowfall({
  target, surfaces = '[data-snowfall-surface]', intensity = 0.55,
  color = '#fff', ground = true, interactive = true, melt = true, zIndex = 10,
  enabled = true, opacity = 1, accumulate = true, settings = true,
  accumulation = 1,
  santa,
  storageKey = 'snowfall-overlay:preferences',
} = {}) {
  const doc = target?.ownerDocument ?? globalThis.document;
  const view = doc?.defaultView;
  if (!view || !doc.body) throw new Error('Create snowfall after the document body is available.');

  if (typeof surfaces === 'string') (target ?? doc).querySelectorAll(surfaces);
  const canvas = doc.createElement('canvas');
  canvas.setAttribute('data-snowfall-canvas', '');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed', pointerEvents: 'none', zIndex: String(zIndex), margin: '0',
  });
  const context = canvas.getContext('2d');
  if (!context) return { start() {}, stop() {}, clear() {}, refresh() {}, setIntensity() {}, destroy() {} };

  const explicitSurfaces = typeof surfaces === 'string' ? null : Array.from(surfaces);
  const motion = view.matchMedia('(prefers-reduced-motion: reduce)');
  const listeners = new view.AbortController();
  const eventOptions = { signal: listeners.signal };
  const particles = [];
  const beds = new Map();
  const floor = {};
  let frame = 0;
  let previous = 0;
  let spawnCredit = 0;
  let dirty = true;
  let running = false;
  let destroyed = false;
  let width = 0;
  let height = 0;
  let left = 0;
  let top = 0;
  let pointer;
  let sweep;
  let observed = new Set();
  let activeBeds = [];
  let density;
  let panel;
  setIntensity(intensity);
  const preferences = {
    enabled, intensity: density, opacity: Number.isFinite(opacity) ? clamp(opacity, 0, 1) : 1,
    accumulate, ground, interactive, melt,
    accumulation: Number.isFinite(accumulation) ? clamp(accumulation, 0, 2) : 1,
    santaEnabled: true,
    santaSpeed: Number.isFinite(santa?.speed) ? clamp(santa.speed, 0.2, 1) : 0.4,
  };
  const scene = target ?? doc;
  const santaSurface = santa?.surface;
  const santaStops = santa?.stops ?? 'a, button, [role="button"]';
  const santaDestinations = santa?.destinations;
  const santaFooter = santa?.crew?.footer;
  const santaInterval = Number.isFinite(santa?.interval) ? Math.max(1, santa.interval) : 35;
  if (santaSurface) {
    scene.querySelector(santaSurface);
    scene.querySelector(santaDestinations ?? santaStops);
    if (santaFooter) scene.querySelector(santaFooter);
  }
  let santaReadyIn = santaInterval;
  let santaRun;
  let santaPose;
  let santaRoof;
  let ropePose;
  let ropeRun;
  let tractorPose;
  let tractorRun;
  let tractorWait = 4;
  let tractorWaves = true;
  let footerElement;
  let footerEdge = Infinity;
  let storage;
  if (settings && storageKey) try {
    storage = view.localStorage;
    const saved = JSON.parse(storage.getItem(storageKey));
    for (const key of Object.keys(preferences)) {
      const value = saved?.[key];
      if (typeof preferences[key] === 'boolean' && typeof value === 'boolean') preferences[key] = value;
      if (typeof preferences[key] === 'number' && Number.isFinite(value)) {
        preferences[key] = clamp(value, key === 'santaSpeed' ? 0.2 : 0, key === 'accumulation' ? 2 : 1);
      }
    }
  } catch {
    storage = undefined;
  }

  function refresh() {
    dirty = true;
  }

  const resize = new view.ResizeObserver(refresh);
  resize.observe(target ?? doc.documentElement);
  const mutations = new view.MutationObserver(records => {
    if (records.some(record => !record.target.matches?.('[data-snowfall-canvas]'))) refresh();
  });
  mutations.observe(target ?? doc.documentElement, {
    subtree: true, childList: true, attributes: true,
  });

  function measure() {
    dirty = false;
    const rect = target?.getBoundingClientRect();
    const visible = !target || (target.isConnected && view.getComputedStyle(target).visibility === 'visible');
    left = Math.max(0, rect?.left ?? 0);
    top = Math.max(0, rect?.top ?? 0);
    width = visible ? Math.max(0, Math.min(view.innerWidth, rect?.right ?? Infinity) - left) : 0;
    height = Math.max(0, Math.min(view.innerHeight, rect?.bottom ?? Infinity) - top);
    footerElement = santaFooter ? scene.querySelector(santaFooter) : null;
    const footer = footerElement?.getBoundingClientRect();
    footerEdge = footer && footer.top < top + height - 24 && footer.bottom > top ? footer.top - top : Infinity;
    const scale = Math.min(view.devicePixelRatio || 1, 2, 4096 / Math.max(width, height, 1));
    const pixelWidth = Math.ceil(width * scale);
    const pixelHeight = Math.ceil(height * scale);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    Object.assign(canvas.style, {
      left: left + 'px', top: top + 'px', width: width + 'px', height: height + 'px',
    });
    context.setTransform(scale, 0, 0, scale, 0, 0);

    const elements = new Set(explicitSurfaces ?? (target ?? doc).querySelectorAll(surfaces));
    const rail = santaSurface ? scene.querySelector(santaSurface) : null;
    if (rail) {
      elements.add(rail);
      const stops = santaDestinations ? scene.querySelectorAll(santaDestinations) : rail.querySelectorAll(santaStops);
      for (const stop of stops) elements.add(stop);
    }
    for (const element of observed) if (!elements.has(element)) resize.unobserve(element);
    for (const element of elements) if (!observed.has(element)) resize.observe(element);
    observed = elements;
    for (const key of beds.keys()) if (key !== floor && !elements.has(key)) beds.delete(key);

    activeBeds = [];
    for (const element of accumulate && accumulation > 0 ? elements : []) {
      if (!element.isConnected || (target && !target.contains(element))) continue;
      const box = element.getBoundingClientRect();
      const x = box.left - left;
      const y = box.top - top;
      if (box.width === 0 || box.height === 0 || x >= width || x + box.width <= 0 || y < 0 || y > height) continue;
      if (view.getComputedStyle(element).visibility !== 'visible') continue;
      placeBed(element, x, y, box.width, 14);
    }
    if (ground && accumulation > 0 && width > 0 && height > 0) placeBed(floor, 0, height, width, 28);
    santaRoof = beds.get(rail);
    activeBeds.sort((a, b) => a.y - b.y);
  }

  function placeBed(key, x, y, span, limit) {
    const count = Math.max(1, Math.min(2048, Math.ceil(span / COLUMN)));
    const bed = beds.get(key) ?? { next: 0 };
    if (bed.depth?.length !== count) {
      const old = bed.depth;
      bed.depth = Float32Array.from({ length: count }, (_, index) =>
        old?.[Math.min(old.length - 1, Math.floor(index * old.length / count))] ?? 0);
    }
    Object.assign(bed, { x, y, span, limit, step: span / count });
    beds.set(key, bed);
    activeBeds.push(bed);
  }

  function movePointer(event) {
    if (!running || event.pointerType === 'touch') return;
    const next = { x: event.clientX, y: event.clientY, time: event.timeStamp };
    if (pointer && next.time - pointer.time < 100) sweep = { from: sweep?.from ?? pointer, to: next };
    pointer = next;
  }

  function forgetPointer() {
    pointer = undefined;
    sweep = undefined;
  }

  function brush() {
    if (!sweep) return;
    const { from, to } = sweep;
    sweep = undefined;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 2 || distance > 320) return;
    const segments = Math.ceil(distance / 10);
    for (let index = 0; index <= segments; index++) {
      const x = from.x + dx * index / segments - left;
      const y = from.y + dy * index / segments - top;
      for (const bed of activeBeds) {
        const first = Math.max(0, Math.floor((x - 13 - bed.x) / bed.step));
        const last = Math.min(bed.depth.length - 1, Math.floor((x + 13 - bed.x) / bed.step));
        for (let column = first; column <= last; column++) {
          const depth = bed.depth[column];
          if (depth < 0.6 || Math.abs(bed.y - depth - y) > 15) continue;
          bed.depth[column] = Math.max(0, depth - 2);
          if (particles.length < MAX_PARTICLES) particles.push({
            x: bed.x + (column + 0.5) * bed.step, y: bed.y - depth - 2,
            vx: clamp(dx * 8, -180, 180) + (Math.random() - 0.5) * 65,
            vy: -40 - Math.random() * 95, radius: 0.75 + Math.random(), powder: true,
          });
        }
      }
    }
  }

  function advance(dt, now) {
    brush();
    const pointerX = pointer ? pointer.x - left : Infinity;
    const pointerY = pointer ? pointer.y - top : Infinity;
    spawnCredit = Math.min(12, spawnCredit + dt * density * Math.min(180, 25 + width * height / 9000));
    while (spawnCredit >= 1 && particles.length < MAX_PARTICLES) {
      spawnCredit--;
      particles.push({
        x: Math.random() * width, y: -5, vx: 5 + Math.random() * 12,
        vy: 28 + Math.random() * 58, radius: 0.7 + Math.random() * 1.8,
      });
    }

    for (let index = particles.length - 1; index >= 0; index--) {
      const particle = particles[index];
      const oldY = particle.y;
      if (particle.powder) particle.vy += 260 * dt;
      const dx = particle.x - pointerX;
      const dy = particle.y - pointerY;
      const distance = pointer ? Math.hypot(dx, dy) : Infinity;
      const deflection = Math.max(0, 1 - distance / 64) ** 2 * 310;
      const drift = particle.vx + Math.sin(now / 650 + oldY / 55) * 13;
      particle.x += (drift + Math.sign(dx || 1) * deflection) * dt;
      particle.y += (particle.vy + Math.sign(dy) * deflection * 0.16) * dt;

      let landed = false;
      for (const bed of activeBeds) {
        // Let some flakes drift in front of the rail and settle on its buttons.
        if (bed === particle.sourceBed || (bed === santaRoof && particle.radius < 1.35)) continue;
        const column = Math.floor((particle.x - bed.x) / bed.step);
        if (column < 0 || column >= bed.depth.length) continue;
        const surface = bed.y - bed.depth[column];
        if (oldY <= surface && particle.y >= surface) {
          bed.depth[column] = Math.min(bed.limit * accumulation, bed.depth[column] + particle.radius * 0.9 * accumulation);
          landed = true;
          break;
        }
      }
      if (landed || particle.y > height + 12 || particle.x < -60 || particle.x > width + 60) {
        particles[index] = particles.at(-1);
        particles.pop();
      }
    }

    for (const bed of activeBeds) {
      const depths = bed.depth;
      for (let index = bed.next; index < depths.length - 1; index += 2) {
        const delta = depths[index] - depths[index + 1];
        const shift = Math.sign(delta) * Math.max(0, Math.abs(delta) - 0.7) * Math.min(0.48, dt * 12);
        depths[index] -= shift;
        depths[index + 1] += shift;
      }
      bed.next = 1 - bed.next;
      if (melt) for (let index = 0; index < depths.length; index++) {
        depths[index] = Math.max(0, depths[index] - dt * 0.12);
      }
    }
  }

  function advanceSanta(dt) {
    santaPose = undefined;
    ropePose = tractorPose = undefined;
    if (!santaSurface || !preferences.santaEnabled || accumulation === 0) {
      santaRun = undefined;
      ropeRun = undefined;
      tractorRun = undefined;
      return;
    }
    const groundBed = activeBeds.includes(beds.get(floor)) ? beds.get(floor) : undefined;
    const motionStep = dt * preferences.santaSpeed;
    if (santaFooter) advanceTractor(dt, motionStep, groundBed);
    if (!accumulate) {
      santaRun = undefined;
      ropeRun = undefined;
      return;
    }
    if (ropeRun) advanceRope(motionStep);

    if (!santaRun) {
      santaReadyIn -= dt;
      if (santaReadyIn > 0) return;
      const rail = scene.querySelector(santaSurface);
      const bed = beds.get(rail);
      if (!activeBeds.includes(bed) || !bed.depth.some(depth => depth >= 2)) {
        santaReadyIn = Math.min(santaInterval, 3);
        return;
      }
      const stops = santaDestinations
        ? pageStops(rail, bed)
        : [...rail.querySelectorAll(santaStops)]
          .filter(element => activeBeds.includes(beds.get(element)))
          .sort((a, b) => beds.get(b).x - beds.get(a).x)
          .slice(0, 12);
      santaRun = { rail, stops, time: 0, cleared: 0, stopIndex: -1, stopCleared: 0 };
      if (santaFooter && !ropeRun) prepareRope(santaRun, bed);
      santaReadyIn = santaInterval * (1 + Math.random() * 0.8);
    }

    const run = santaRun;
    const rail = beds.get(run.rail);
    if (!activeBeds.includes(rail)) {
      santaRun = undefined;
      return;
    }
    run.time += motionStep;
    const entrance = 0.75;
    const sweepTime = clamp(rail.span / 82, 6, 16);
    const sweepProgress = clamp((run.time - entrance) / sweepTime, 0, 1);
    const swept = Math.floor(sweepProgress * rail.depth.length);
    shakeSnow(rail, run.cleared, swept);
    run.cleared = swept;

    const first = { x: rail.x - 20, y: rail.y };
    const last = { x: rail.x + rail.span, y: rail.y };
    if (run.time <= sweepTime + entrance) {
      const entered = Math.min(1, run.time / entrance);
      const x = first.x + 20 * entered + rail.span * sweepProgress;
      santaPose = { x, y: Math.max(33, rail.y) + Math.sin(run.time * 9) * 1.1, facing: 1 };
      return;
    }

    const stopTime = 4.8;
    const flightTime = 1.5;
    const elapsed = run.time - sweepTime - entrance;
    const index = Math.floor(elapsed / stopTime);
    if (index >= run.stops.length) {
      santaRun = undefined;
      return;
    }
    const previous = sweepBounds(run.stops[index - 1]);
    const from = index === 0 || !previous ? last : { x: previous.right, y: previous.y };
    const destination = sweepBounds(run.stops[index]);
    const phase = elapsed - index * stopTime;
    if (!destination) return;
    if (run.stopIndex !== index) {
      run.stopIndex = index;
      run.stopCleared = destination.bed
        ? Math.max(0, Math.floor((destination.left - destination.bed.x) / destination.bed.step)) : 0;
    }
    if (phase >= flightTime) {
      const sweep = clamp((phase - flightTime - 0.35) / (stopTime - flightTime - 0.7), 0, 1);
      const x = destination.left + (destination.right - destination.left) * sweep;
      if (destination.bed) {
        const end = Math.floor((x - destination.bed.x) / destination.bed.step) + 1;
        shakeSnow(destination.bed, run.stopCleared, end);
        run.stopCleared = end;
      }
      santaPose = { x, y: destination.y, facing: 1,
        opacity: index === run.stops.length - 1 ? clamp((stopTime - phase) / 0.32, 0, 1) : 1 };
      return;
    }
    const to = { x: destination.left, y: destination.y };
    const progress = phase / flightTime;
    const eased = progress * progress * (3 - 2 * progress);
    const arc = clamp(Math.hypot(to.x - from.x, to.y - from.y) * 0.14, 24, 86);
    santaPose = {
      x: from.x + (to.x - from.x) * eased,
      y: Math.max(30, Math.max(33, from.y) + (Math.max(33, to.y) - Math.max(33, from.y)) * eased
        - Math.sin(progress * Math.PI) * arc),
      facing: Math.sign(to.x - from.x) || 1,
    };
  }

  function sweepBounds(element) {
    const bed = beds.get(element);
    if (!activeBeds.includes(bed) || bed.y >= footerEdge || footerElement?.contains(element)) return;
    return { bed, left: Math.max(12, bed.x), right: Math.min(width - 12, bed.x + bed.span), y: bed.y };
  }

  function prepareRope(run, rail) {
    const reserved = new Set([rail, beds.get(floor), ...run.stops.map(stop => beds.get(stop))]);
    const reachable = activeBeds.filter(bed => bed.y > rail.y + 36 && bed.y < footerEdge - 12 && bed !== beds.get(floor));
    const candidates = reachable.filter(bed => !reserved.has(bed));
    const positions = [width * 0.13, width * 0.86];
    const coverage = x => reachable.filter(bed => x >= bed.x && x <= bed.x + bed.span);
    const score = x => coverage(x).reduce((total, bed) => total + (candidates.includes(bed) ? 2 : 1), 0);
    const side = score(positions[1]) > score(positions[0]) ? 1 : 0;
    const anchor = positions[side];
    ropeRun = { wait: 2.5, anchor, stops: coverage(anchor), index: 0, y: 32, cleaning: 0, cleared: 0 };
  }

  function advanceRope(dt) {
    const run = ropeRun;
    run.wait -= dt;
    if (run.wait > 0) return;
    const { anchor } = run;
    const end = Math.min(height - 6, footerEdge - 10);
    if (run.y > end || anchor >= width) {
      ropeRun = undefined;
      return;
    }
    let bed;
    while (run.index < run.stops.length) {
      bed = run.stops[run.index];
      if (activeBeds.includes(bed) && bed.y >= run.y && bed.y < end && anchor >= bed.x && anchor <= bed.x + bed.span) break;
      bed = undefined;
      run.index++;
      run.cleaning = run.cleared = 0;
    }
    const targetY = bed?.y ?? end;
    const speed = Math.max(44, height / 10);
    run.y = Math.min(targetY, run.y + speed * dt);
    let sweep = 0;
    if (bed && run.y === targetY) {
      const first = Math.max(0, Math.floor((anchor - 22 - bed.x) / bed.step));
      const last = Math.min(bed.depth.length, Math.ceil((anchor + 22 - bed.x) / bed.step));
      const hasSnow = run.cleaning > 0 || bed.depth.subarray(first, last).some(depth => depth >= 0.45);
      if (hasSnow) {
        run.cleaning += dt;
        const progress = clamp(run.cleaning / 2.8, 0, 1);
        const swept = first + Math.floor((last - first) * progress);
        shakeSnow(bed, Math.max(first, run.cleared), swept);
        run.cleared = swept;
        sweep = Math.sin(run.cleaning * 8) * 9;
      }
      if (!hasSnow || run.cleaning >= 2.8) {
        run.index++;
        run.cleaning = run.cleared = 0;
      }
    }
    ropePose = { anchor, x: anchor, y: run.y, sweep,
      facing: anchor < width / 2 ? 1 : -1, opacity: clamp((end - run.y) / 25, 0, 1) };
    if (!bed && run.y === end) ropeRun = undefined;
  }

  function advanceTractor(dt, motionStep, bed) {
    if (!bed || height < 100) {
      tractorRun = undefined;
      return;
    }
    if (!tractorRun) {
      tractorWait -= dt;
      if (tractorWait > 0) return;
      if (!bed.depth.some(depth => depth >= 1.5)) {
        tractorWait = 3;
        return;
      }
      tractorRun = { time: 0, cleared: bed.depth.length, wave: tractorWaves };
      tractorWaves = !tractorWaves;
      tractorWait = 24 + Math.random() * 20;
    }
    const run = tractorRun;
    run.time += motionStep;
    const drive = clamp(width / 78, 7, 20);
    const pauseAt = drive * 0.53;
    const pause = run.wave ? 2.6 : 0;
    const stationary = run.time >= pauseAt && run.time < pauseAt + pause;
    const drivingTime = run.time - clamp(run.time - pauseAt, 0, pause);
    const progress = clamp(drivingTime / drive, 0, 1);
    const x = width + 40 - (width + 80) * progress;
    const end = clamp(Math.floor((x - 29 - bed.x) / bed.step), 0, bed.depth.length);
    if (!stationary) {
      shakeSnow(bed, end, run.cleared, -1);
      run.cleared = end;
    }
    tractorPose = { x, y: height - 1, stationary, wave: run.time - pauseAt,
      opacity: clamp((drive + pause + 0.9 - run.time) / 0.9, 0, 1) };
    if (run.time >= drive + pause + 0.9) tractorRun = undefined;
  }

  function stopPoint(element) {
    const bed = beds.get(element);
    if (!activeBeds.includes(bed)) return;
    const visibleLeft = Math.max(0, bed.x);
    const visibleRight = Math.min(width, bed.x + bed.span);
    return { x: (visibleLeft + visibleRight) / 2, y: bed.y };
  }

  function pageStops(rail, bed) {
    const remaining = [...scene.querySelectorAll(santaDestinations)]
      .filter(element => !rail.contains(element) && !footerElement?.contains(element))
      .map(element => ({ element, point: stopPoint(element) }))
      .filter(({ point }) => point && point.y > bed.y + 24 && point.y < Math.min(height - 16, footerEdge));
    const stops = [];
    let from = { x: Math.min(width, bed.x + bed.span), y: bed.y };
    while (remaining.length && stops.length < 5) {
      const distance = ({ point }) => Math.hypot(point.x - from.x, point.y - from.y);
      remaining.sort((a, b) => distance(a) - distance(b));
      const next = remaining.shift();
      if (distance(next) < 56) continue;
      stops.push(next.element);
      from = next.point;
    }
    return stops;
  }

  function shakeSnow(bed, start, end, direction = 1) {
    for (let index = start; index < Math.min(end, bed.depth.length); index++) {
      const depth = bed.depth[index];
      bed.depth[index] = 0;
      if (depth < 0.45 || index % 2 !== 0 || particles.length >= MAX_PARTICLES) continue;
      particles.push({
        x: bed.x + (index + 0.5) * bed.step,
        y: bed.y - depth,
        vx: direction * (35 + Math.random() * 105),
        vy: -25 - Math.random() * 70,
        radius: 0.8 + Math.random() * 1.8,
        powder: true,
        sourceBed: bed,
      });
    }
  }

  function draw() {
    context.clearRect(0, 0, width, height);
    context.fillStyle = color;
    for (const bed of activeBeds) {
      context.beginPath();
      context.moveTo(bed.x, bed.y);
      for (let index = 0; index < bed.depth.length; index++) {
        context.lineTo(bed.x + (index + 0.5) * bed.step, bed.y - bed.depth[index]);
      }
      context.lineTo(bed.x + bed.span, bed.y);
      context.closePath();
      context.fill();
    }
    context.globalAlpha = 0.84;
    context.beginPath();
    for (const { x, y, radius } of particles) {
      context.moveTo(x + radius, y);
      context.arc(x, y, radius, 0, Math.PI * 2);
    }
    context.fill();
    context.globalAlpha = 1;
    if (santaPose) drawSanta(context, santaPose);
    if (ropePose) drawRopeSanta(context, ropePose);
    if (tractorPose) drawTractorSanta(context, tractorPose);
  }

  function tick(now) {
    frame = 0;
    if (dirty) measure();
    const dt = previous ? Math.min((now - previous) / 1000, 0.05) : 0;
    previous = now;
    if (width && height) {
      advance(dt, now);
      advanceSanta(dt);
      draw();
    }
    sync();
  }

  function sync() {
    if (running && enabled && !motion.matches && !doc.hidden) {
      if (!frame) frame = view.requestAnimationFrame(tick);
    } else {
      if (frame) view.cancelAnimationFrame(frame);
      frame = previous = 0;
      forgetPointer();
    }
    canvas.hidden = !enabled || motion.matches;
  }

  function start() {
    if (destroyed) return;
    running = true;
    refresh();
    sync();
  }

  function stop() {
    running = false;
    sync();
  }

  function clear() {
    particles.length = 0;
    spawnCredit = 0;
    for (const bed of beds.values()) bed.depth.fill(0);
    context.clearRect(0, 0, width, height);
  }

  function setIntensity(value) {
    if (!Number.isFinite(value)) throw new TypeError('Snowfall intensity must be a finite number.');
    density = clamp(value, 0, 1);
    if (density === 0) spawnCredit = 0;
    panel?.syncIntensity(density);
  }

  function applyPreferences() {
    if (accumulation !== preferences.accumulation) {
      accumulation = preferences.accumulation;
      for (const bed of beds.values()) {
        for (let index = 0; index < bed.depth.length; index++) {
          bed.depth[index] = Math.min(bed.depth[index], bed.limit * accumulation);
        }
      }
      refresh();
    }
    if (accumulate !== preferences.accumulate || ground !== preferences.ground || enabled !== preferences.enabled) {
      refresh();
    }
    ({ enabled, opacity, accumulate, ground, interactive, melt } = preferences);
    setIntensity(preferences.intensity);
    canvas.style.opacity = String(opacity);
    if (!interactive) forgetPointer();
    sync();
  }

  function destroy() {
    if (destroyed) return;
    stop();
    destroyed = true;
    listeners.abort();
    resize.disconnect();
    mutations.disconnect();
    clear();
    beds.clear();
    observed.clear();
    activeBeds = [];
    panel?.remove();
    canvas.remove();
  }

  view.addEventListener('resize', refresh, eventOptions);
  doc.addEventListener('scroll', refresh, { ...eventOptions, capture: true, passive: true });
  doc.addEventListener('visibilitychange', sync, eventOptions);
  doc.addEventListener('transitionend', refresh, { ...eventOptions, capture: true });
  motion.addEventListener('change', sync, eventOptions);
  doc.addEventListener('pointermove', event => {
    if (interactive && enabled) movePointer(event);
  }, { ...eventOptions, passive: true });
  view.addEventListener('blur', forgetPointer, eventOptions);
  doc.documentElement.addEventListener('pointerleave', forgetPointer, eventOptions);
  doc.body.append(canvas);
  if (settings) panel = mountSettings(doc, preferences, Boolean(santaSurface), clear, (key, value) => {
    preferences.intensity = density;
    preferences[key] = value;
    applyPreferences();
    try {
      storage?.setItem(storageKey, JSON.stringify(preferences));
    } catch {
      // Settings still apply when storage is unavailable.
    }
  });
  applyPreferences();
  start();
  return { start, stop, clear, refresh, setIntensity, destroy };
}


function mountSettings(doc, values, showSanta, clear, change) {
  const host = doc.createElement('div');
  host.setAttribute('data-snowfall-settings', '');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host { all: initial; position: fixed; inset-inline-end: 16px; inset-block-end: 16px; z-index: 60;
        color: #f0f4fb; font: 14px/1.4 system-ui, sans-serif; color-scheme: dark; }
      button, summary, .panel { border: 1px solid #465469; background: #192333; color: inherit; border-radius: 10px; }
      button, summary { font: inherit; padding: 8px 12px; cursor: pointer; }
      summary { list-style: none; width: max-content; margin-inline-start: auto; }
      summary::-webkit-details-marker { display: none; }
      .panel { box-sizing: border-box; position: absolute; inset-inline-end: 0; bottom: calc(100% + 8px);
        width: min(17rem, calc(100vw - 32px)); max-height: calc(100dvh - 76px); overflow: auto;
        padding: 14px; display: grid; gap: 10px; box-shadow: 0 12px 36px #0005; }
      label { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      label.slider { display: grid; grid-template-columns: 1fr auto; }
      input { accent-color: #83baff; }
      input[type=range] { grid-column: span 2; width: 100%; margin: 0; }
      output { font-variant-numeric: tabular-nums; }
      :focus-visible { outline: 2px solid #83baff; outline-offset: 2px; }
    </style>
    <details>
      <summary>Snow settings</summary>
      <div class="panel">
        <label>Snowfall <input type="checkbox" name="enabled"></label>
        <label class="slider">Intensity <output aria-hidden="true"></output>
          <input type="range" name="intensity" min="0" max="100"></label>
        <label class="slider">Opacity <output aria-hidden="true"></output>
          <input type="range" name="opacity" min="0" max="100"></label>
        <label class="slider">Accumulation <output aria-hidden="true"></output>
          <input type="range" name="accumulation" min="0" max="200"></label>
        <label>Collect on elements <input type="checkbox" name="accumulate"></label>
        <label>Collect at the bottom <input type="checkbox" name="ground"></label>
        <label>React to pointer <input type="checkbox" name="interactive"></label>
        <label>Melt over time <input type="checkbox" name="melt"></label>
        ${showSanta ? `<label>Mini Santa <input type="checkbox" name="santaEnabled"></label>
        <label class="slider">Santa speed <output aria-hidden="true"></output>
          <input type="range" name="santaSpeed" min="20" max="100"></label>` : ''}
        <button type="button">Clear snow</button>
      </div>
    </details>`;

  const details = root.querySelector('details');
  const summary = root.querySelector('summary');
  details.addEventListener('keydown', event => {
    if (event.key === 'Escape' && details.open) {
      details.open = false;
      summary.focus();
      event.stopPropagation();
    }
  });
  root.querySelector('button').addEventListener('click', clear);
  for (const input of root.querySelectorAll('input')) {
    const key = input.name;
    if (input.type === 'checkbox') {
      input.checked = values[key];
      input.addEventListener('change', () => change(key, input.checked));
    } else {
      updateSlider(input, values[key]);
      input.addEventListener('input', () => {
        const value = input.valueAsNumber / 100;
        updateSlider(input, value);
        change(key, value);
      });
    }
  }
  doc.body.append(host);
  return {
    remove: () => host.remove(),
    syncIntensity: value => updateSlider(root.querySelector('[name=intensity]'), value),
  };
}

function updateSlider(input, value) {
  const percent = Math.round(value * 100);
  input.value = String(percent);
  input.setAttribute('aria-valuetext', percent + '%');
  input.previousElementSibling.value = percent + '%';
}

function drawSanta(context, { x, y, facing, opacity = 1, tool = 'broom', wave = 0, sweep = 0 }) {
  context.save();
  context.translate(Math.round(x), Math.round(y));
  context.scale(facing, 1);
  context.globalAlpha = opacity;
  const oval = (color, cx, cy, rx, ry) => {
    context.fillStyle = color;
    context.beginPath();
    context.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    context.fill();
  };

  oval('#562338', -8, -12, 5, 7);
  oval('#ab2435', 0, -9, 8, 7);
  oval('#251d2b', -4, -2, 4, 2);
  oval('#251d2b', 5, -2, 4, 2);
  context.fillStyle = '#302229';
  context.fillRect(-7, -8, 14, 2);
  context.fillStyle = '#ffcc69';
  context.fillRect(-1, -9, 3, 4);

  oval('#f6bd96', 1, -19, 6, 6);
  oval('#fff4e9', 2, -16, 6, 4);
  oval('#332633', 4, -20, 0.85, 1);
  if (tool === 'wave') {
    context.strokeStyle = '#943a43';
    context.lineWidth = 1.2;
    context.beginPath();
    context.arc(3, -17.5, 2.6, 0.1, Math.PI - 0.1);
    context.stroke();
  }
  context.fillStyle = '#dc3947';
  context.beginPath();
  context.moveTo(-6, -23);
  context.quadraticCurveTo(-9, -34, 1, -30);
  context.lineTo(8, -23);
  context.closePath();
  context.fill();
  oval('#fff4e9', -7, -29, 2.6, 2.6);
  oval('#fff4e9', 0, -23, 7, 2);

  if (tool === 'wave') {
    const hand = 13 + Math.sin(wave * 9) * 4;
    context.strokeStyle = '#dc3947';
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(5, -12);
    context.lineTo(10, -17);
    context.lineTo(hand, -24);
    context.stroke();
    oval('#fff4e9', hand, -24, 2.6, 2.8);
  } else if (tool === 'broom' || tool === 'rope') {
    context.strokeStyle = '#9c613f';
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(8, -12);
    context.lineTo(16 + sweep, -1);
    context.stroke();
    oval('#eac07e', 17 + sweep, -1, 4, 2);
    oval('#fff4e9', 8, -11, 2.5, 2.5);
    if (tool === 'rope') oval('#fff4e9', -3, -15, 2.5, 2.5);
  }
  context.restore();
}

function drawRopeSanta(context, pose) {
  context.save();
  context.globalAlpha = pose.opacity * 0.85;
  context.strokeStyle = '#d6b189';
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(pose.anchor, 0);
  context.lineTo(pose.anchor, pose.y - 13);
  context.stroke();
  context.restore();
  drawSanta(context, { ...pose, tool: 'rope' });
}

function drawTractorSanta(context, { x, y, stationary, wave, opacity }) {
  drawSanta(context, { x: x + 8, y: y - 12, facing: -1, opacity, tool: stationary ? 'wave' : 'drive', wave });
  context.save();
  context.translate(Math.round(x), Math.round(y));
  context.globalAlpha = opacity;
  context.fillStyle = '#236b6a';
  context.fillRect(-23, -18, 24, 11);
  context.fillRect(-17, -9, 43, 5);
  context.fillStyle = '#64c4a5';
  context.fillRect(-23, -18, 23, 3);
  context.fillStyle = '#22313d';
  context.fillRect(-14, -24, 3, 7);
  context.fillStyle = '#ffe1a0';
  context.fillRect(-24, -15, 3, 4);
  for (const [wheelX, radius] of [[-16, 5], [14, 8]]) {
    for (const [r, color] of [[radius, '#1a202a'], [radius * 0.49, '#bd9f68']]) {
      context.fillStyle = color;
      context.beginPath();
      context.arc(wheelX, -radius, r, 0, Math.PI * 2);
      context.fill();
    }
    if (!stationary) {
      const angle = x / radius;
      context.fillStyle = '#51433e';
      context.fillRect(wheelX + Math.cos(angle) * radius * 0.32 - 1,
        -radius + Math.sin(angle) * radius * 0.32 - 1, 2, 2);
    }
  }
  context.fillStyle = '#96b7cc';
  context.beginPath();
  context.moveTo(-25, -9);
  context.lineTo(-34, 0);
  context.lineTo(-25, 0);
  context.lineTo(-22, -9);
  context.fill();
  context.restore();
}

globalThis.SnowfallOverlay = { createSnowfall };
})();
