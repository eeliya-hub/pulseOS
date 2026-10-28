/* ───────────────────────────────────────────────────────────────────────────
   Pulse OS — "The Room"

   Two numbers run this page. The first is the hour, which scrolling moves:
   the sky in the window, the sun behind it, the shaft of light across the
   desk, the lamp and the warmth of the walls are all read off it. The second
   is the camera, which a click on something moves: the whole stage is pushed
   so that thing fills the frame.

   The stage is a fixed 1600 × 900 and is scaled to fit the window as one
   piece, so there is no layout here that can break at an awkward size.
   ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.documentElement;
  var stage = document.querySelector('.stage');

  var frameEl = document.querySelector('.frame');
  var narrow = false;

  var W = 1600;
  var H = 900;

  /* ── The hours ────────────────────────────────────────────────────────────
     Stops through one day. `room` is how much light the walls are holding,
     `light` is the colour coming through the window, `lamp` is the lamp.
     Anything between two stops is mixed. */
  var STOPS = [
    { at: 5,  top: '#171634', low: '#4a3350', room: '#0a0c18', light: '#8ea0ff', on: 0.1,  lamp: 0.55, stars: 0.5,  accent: '#ffb59c' },
    { at: 7,  top: '#2b2a5c', low: '#c4857a', room: '#141528', light: '#ffc49a', on: 0.6,  lamp: 0.2,  stars: 0.04, accent: '#ffc9a3' },
    { at: 9,  top: '#13306b', low: '#71a6c4', room: '#1a1e33', light: '#ffe7c9', on: 0.95, lamp: 0,    stars: 0,    accent: '#9fd0ff' },
    { at: 13, top: '#0f3f8c', low: '#8fc4dd', room: '#1d2238', light: '#fff4e2', on: 1,    lamp: 0,    stars: 0,    accent: '#bfe2ff' },
    { at: 17, top: '#1d2f6d', low: '#c67a62', room: '#191a30', light: '#ffb988', on: 0.72, lamp: 0.12, stars: 0,    accent: '#ffb59c' },
    { at: 19, top: '#1b1d4a', low: '#8a4258', room: '#111226', light: '#ff9d7a', on: 0.3,  lamp: 0.5,  stars: 0.18, accent: '#ffa8cf' },
    { at: 21, top: '#0d1134', low: '#2b2456', room: '#0b0d1c', light: '#7f8ce0', on: 0.06, lamp: 0.85, stars: 0.8,  accent: '#a9bbff' },
    { at: 24, top: '#070a22', low: '#191838', room: '#070912', light: '#6f7ad0', on: 0,    lamp: 1,    stars: 1,    accent: '#a9bbff' },
  ];

  var FROM = 5;
  var TO = 24;

  function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
  function mix(a, b, k) {
    var x = hex(a), y = hex(b);
    return 'rgb(' + x.map(function (v, i) { return Math.round(v + (y[i] - v) * k); }).join(',') + ')';
  }
  function between(a, b, k) { return a + (b - a) * k; }

  function lightAt(hour) {
    var a = STOPS[0], b = STOPS[STOPS.length - 1];
    for (var i = 0; i < STOPS.length - 1; i += 1) {
      if (hour >= STOPS[i].at && hour <= STOPS[i + 1].at) { a = STOPS[i]; b = STOPS[i + 1]; break; }
    }
    var k = a === b ? 0 : (hour - a.at) / (b.at - a.at);
    var e = k * k * (3 - 2 * k);
    return {
      top: mix(a.top, b.top, e),
      low: mix(a.low, b.low, e),
      room: mix(a.room, b.room, e),
      light: mix(a.light, b.light, e),
      accent: mix(a.accent, b.accent, e),
      on: between(a.on, b.on, e),
      lamp: between(a.lamp, b.lamp, e),
      stars: between(a.stars, b.stars, e),
    };
  }

  /* The app's own four lights, from frontend/src/hooks/useSky.js. */
  function phaseAt(hour) {
    if (hour >= 5 && hour < 8) return 'dawn';
    if (hour >= 8 && hour < 17) return 'day';
    if (hour >= 17 && hour < 20.5) return 'dusk';
    return 'night';
  }

  /* ── The hour you are scrolled to ─────────────────────────────────────── */

  var clockEl = document.querySelector('[data-clock]');
  var halfEl = document.querySelector('[data-half]');

  function hourNow() {
    var span = document.body.scrollHeight - window.innerHeight;
    var k = span <= 0 ? 0 : Math.min(1, Math.max(0, window.scrollY / span));
    return FROM + k * (TO - FROM);
  }

  function light() {
    var hour = hourNow();
    var s = lightAt(hour);

    root.style.setProperty('--sky-top', s.top);
    root.style.setProperty('--sky-low', s.low);
    root.style.setProperty('--room', s.room);
    root.style.setProperty('--light', s.light);
    root.style.setProperty('--light-on', s.on.toFixed(3));
    root.style.setProperty('--lamp', s.lamp.toFixed(3));
    root.style.setProperty('--stars', s.stars.toFixed(3));
    root.style.setProperty('--accent', s.accent);

    // The coffee is only hot for the first couple of hours of it.
    root.style.setProperty('--steam', Math.max(0, Math.min(1, (10.5 - hour) / 2.5)).toFixed(3));

    viewByClock(hour);

    /*
     * The sun crosses the window between six and eight, and the shaft it
     * throws swings the other way across the desk — low and long at either
     * end of the day, short and steep at noon, which is what sells the hour
     * more than the colour does.
     */
    var day = (hour - 6) / 14;
    var up = day >= 0 && day <= 1;
    var high = up ? Math.sin(day * Math.PI) : 0;
    root.style.setProperty('--sun-x', (12 + day * 76).toFixed(1) + '%');
    root.style.setProperty('--sun-y', (96 - high * 78).toFixed(1) + '%');
    root.style.setProperty('--sun-glow', (up ? 0.35 + high * 0.65 : 0).toFixed(2));

    root.style.setProperty('--shaft-x', Math.round(-60 + day * 150) + 'px');
    root.style.setProperty('--shaft-skew', ((0.5 - day) * 96).toFixed(1) + 'deg');

    if (clockEl) {
      var h = Math.floor(hour) % 24;
      var m = Math.floor((hour % 1) * 60);
      clockEl.textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
      if (halfEl) halfEl.textContent = phaseAt(hour);
    }
  }

  var waiting = false;
  window.addEventListener(
    'scroll',
    function () {
      if (waiting) return;
      waiting = true;
      requestAnimationFrame(function () { light(); waiting = false; });
    },
    { passive: true },
  );

  /* ── The lamp ─────────────────────────────────────────────────────────────
     The room's one switch. Pulling its chain winds the clock on to the next
     of the app's four lights — dawn, day, dusk, night, and round again — by
     scrolling there, so everything that follows the hour follows it. */

  var lampEl = document.querySelector('[data-lamp]');
  var PHASES = ['dawn', 'day', 'dusk', 'night'];
  var PHASE_HOUR = { dawn: 6.5, day: 12, dusk: 18.5, night: 22.5 };
  var winding = 0;

  function windTo(hour) {
    var span = document.body.scrollHeight - window.innerHeight;
    var to = (span * (hour - FROM)) / (TO - FROM);
    var from = window.scrollY;
    var id = (winding += 1);
    if (reduced) { window.scrollTo(0, to); return; }
    var t0 = performance.now();
    var dur = 1600;
    (function step(t) {
      if (id !== winding) return;
      var k = Math.min(1, (t - t0) / dur);
      var e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      window.scrollTo(0, from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }

  function pullLamp() {
    var next = PHASES[(PHASES.indexOf(phaseAt(hourNow())) + 1) % PHASES.length];
    lampEl.classList.remove('is-pulled');
    void lampEl.offsetWidth;   // so the pull plays again on every pull
    lampEl.classList.add('is-pulled');
    windTo(PHASE_HOUR[next]);
    hideHint();
  }

  if (lampEl) {
    lampEl.addEventListener('click', pullLamp);
    lampEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pullLamp(); }
    });
  }

  /* ── The camera ───────────────────────────────────────────────────────────
     Fitting the stage to the window, and pushing it so a thing fills the
     frame. Both are the same transform, so they compose without fighting. */

  var leaves = {};
  var open = null;
  var openName = '';
  var tall = false;

  /*
   * A wide window gets the whole room. A tall one gets a crop of it: close
   * enough that the monitor fills the width, and framed so the edge of the
   * desk lands about two thirds down. The wall and the desk run far past the
   * stage, so the room fills the glass either way and nothing letterboxes.
   */
  function fit() {
    // The room's own box, which on a phone is only the top half of the glass.
    var w = frameEl.clientWidth;
    var h = frameEl.clientHeight;
    narrow = window.matchMedia('(max-width: 860px)').matches;
    tall = w / h < 1.15;
    var k = tall ? Math.min((w / W) * 1.7, h / H) : Math.min(w / W, h / H);
    root.style.setProperty('--fit', k.toFixed(4));
    if (!open) rest();
    else aim();
  }

  function fitNow() { return parseFloat(root.style.getPropertyValue('--fit')) || 1; }

  function rest() {
    root.style.setProperty('--cam-x', '0px');
    root.style.setProperty('--cam-y', tall ? '120px' : '0px');
    root.style.setProperty('--cam-z', '1');
  }

  function pushTo(el) {
    // Where the thing's middle sits on the stage, and how much to magnify it.
    var x = el.offsetLeft + el.offsetWidth / 2;
    var y = el.offsetTop + el.offsetHeight / 2;
    var z = Math.min(1.6, Math.max(1.15, (W * (tall ? 0.3 : 0.36)) / el.offsetWidth));
    /*
     * The stage reads `scale(fit) translate(cam) scale(zoom)`, so the move has
     * already been through the zoom by the time it is applied — it has to be
     * multiplied by it, or the camera lands short of whatever it aimed at.
     * The leaf of text takes the bottom, so it aims a little high as well.
     */
    root.style.setProperty('--cam-z', z.toFixed(3));
    root.style.setProperty('--cam-x', (-z * (x - W / 2)).toFixed(1) + 'px');
    root.style.setProperty('--cam-y', (-z * (y - H / 2) - H * (tall ? 0.22 : 0.15)).toFixed(1) + 'px');
  }

  /*
   * For the things you read: a box on the stage, filled as far as the glass
   * allows between the bar along the top and the controls along the bottom.
   * The same transform as pushTo, solved for a box rather than a thing.
   */
  function frameBox(cx, cy, bw, bh) {
    var k = fitNow();
    var top = narrow ? 64 : 82;
    var bottom = narrow ? 140 : 96;
    var z = Math.min((frameEl.clientWidth * 0.94) / (bw * k), (frameEl.clientHeight - top - bottom) / (bh * k));
    z = Math.max(1, Math.min(z, narrow ? 4.4 : 2.5));
    var lift = (top - bottom) / 2;   // where the middle of the free space is
    root.style.setProperty('--cam-z', z.toFixed(3));
    root.style.setProperty('--cam-x', (-z * (cx - W / 2)).toFixed(1) + 'px');
    root.style.setProperty('--cam-y', (lift / k - z * (cy - H / 2)).toFixed(1) + 'px');
  }

  function aim() {
    if (!open) return;
    if (openName === 'book') aimCards();
    else if (openName === 'post') aimPaper();
    else pushTo(document.querySelector('[data-open="' + openName + '"]'));
  }

  /* ── Opening a thing ──────────────────────────────────────────────────── */

  document.querySelectorAll('[data-leaf]').forEach(function (leaf) {
    leaves[leaf.getAttribute('data-leaf')] = leaf;
  });

  var cardsEl = document.querySelector('.cards');
  var paperEl = document.querySelector('.paper');

  function show(name, quiet) {
    var thing = document.querySelector('[data-open="' + name + '"]');
    var leaf = leaves[name];
    if (!thing || !leaf) return;
    if (openName === name) { if (!quiet) aim(); return; }

    if (openName === 'post') closePaper();
    if (openName === 'book') closeCards();
    if (open) open.classList.remove('is-open');
    open = leaf;
    openName = name;
    leaf.classList.add('is-open');
    document.querySelectorAll('[data-open]').forEach(function (t) {
      // The cards and the paper open and close themselves, in their own time.
      if (t !== cardsEl && t !== paperEl) t.classList.toggle('is-open', t === thing);
    });

    var reading = name === 'book' || name === 'post';
    stage.classList.toggle('is-reading', reading);
    document.body.classList.toggle('is-reading', reading);
    if (name === 'book') openCards();
    if (name === 'post') openPaper();
    // The phone's loop is behind a blur while you read; no point running it.
    if (phoneClip && reading) phoneClip.pause();
    else if (phoneClip && !reduced) playPhone();

    // On a phone the glass grows when you are reading, so the room is refitted.
    if (narrow) fit();
    if (quiet) rest();
    else aim();
    hideHint();
    document.querySelectorAll('.tabs button').forEach(function (b) {
      b.classList.toggle('is-here', b.getAttribute('data-go') === name);
    });
  }

  function hide() {
    if (openName === 'post') closePaper();
    if (openName === 'book') closeCards();
    if (open) open.classList.remove('is-open');
    document.querySelectorAll('[data-open]').forEach(function (t) {
      if (t !== cardsEl && t !== paperEl) t.classList.remove('is-open');
    });
    open = null;
    openName = '';
    stage.classList.remove('is-reading');
    document.body.classList.remove('is-reading');
    if (phoneClip && !reduced) playPhone();
    if (narrow) fit();
    rest();
    document.querySelectorAll('.tabs button').forEach(function (b) { b.classList.remove('is-here'); });
    if (narrow) show('screen', true);
  }

  document.querySelectorAll('[data-open]').forEach(function (thing) {
    var name = thing.getAttribute('data-open');
    thing.addEventListener('click', function () { show(name); });
    thing.addEventListener('keydown', function (e) {
      if (e.target !== thing) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(name); }
    });
  });
  document.querySelectorAll('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () { show(b.getAttribute('data-go')); });
  });
  document.querySelectorAll('.leaf .shut').forEach(function (b) {
    b.addEventListener('click', hide);
  });
  var hush = document.querySelector('.hush');
  if (hush) hush.addEventListener('click', hide);
  var home = document.querySelector('[data-home]');
  if (home) home.addEventListener('click', function (e) { e.preventDefault(); hide(); });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (player && player.classList.contains('is-open')) closeFilm();
    else hide();
  });

  /* ── What is on the monitor ───────────────────────────────────────────────
     Every view was captured from the running app at each of the four phases
     of its sky (see scripts/shoot-screens.mjs), so the screen is the app as
     it actually looks at the hour you have scrolled to — not one capture
     with the hour painted over it. Two panes crossfade, which covers a change
     of view and a change of light with the same mechanism. */

  var VIEWS = {
    home: 'The Pulse OS home screen',
    mail: 'Pulse finding the dates and tasks in an email',
    projects: 'The Pulse OS project board',
    schedule: 'The month, with the day beside it',
    news: 'News, markets and sport',
    music: 'The immersive player',
    travel: 'The Pulse OS travel view',
    apps: 'The launchpad',
    ask: 'Pulse working on a question',
  };

  /*
   * Two views are not lit by the sky and so have one picture each: the
   * immersive player takes its colours from the record, and voice mode is a
   * full-screen overlay. Capturing those four times over says nothing.
   */
  var FIXED = {
    music: 'release/gallery/immersive.jpg',
    ask: 'release/gallery/voice-speaking.jpg',
  };

  var panes = [].slice.call(document.querySelectorAll('.screen .pane'));
  var saysEl = document.querySelector('[data-says]');
  var titleEl = leaves.screen && leaves.screen.querySelector('h2');
  var featuresEl = document.querySelector('[data-features]');

  var lit = 0;        // which pane is in front
  var onScreen = '';  // the file it is showing

  function putUp(view, phase) {
    if (!panes.length) return;
    var src = FIXED[view] || 'assets/screens/' + view + '-' + phase + '.jpg';
    if (src === onScreen) return;
    onScreen = src;

    var next = panes[1 - lit];
    var gone = panes[lit];
    var swapped = false;
    var done = function () {
      if (swapped) return;
      swapped = true;
      next.classList.add('is-on');
      gone.classList.remove('is-on');
      // Only the one in front is worth reading out.
      gone.alt = '';
      gone.setAttribute('aria-hidden', 'true');
      lit = 1 - lit;
    };
    next.alt = VIEWS[view] || '';
    next.removeAttribute('aria-hidden');
    next.onload = done;
    // A phase that was never captured falls back to daylight rather than
    // leaving a broken pane on the desk.
    next.onerror = function () {
      if (FIXED[view] || phase === 'day') { onScreen = ''; return; }  // leave what is up
      next.onerror = function () { onScreen = ''; };
      next.src = 'assets/screens/' + view + '-day.jpg';
    };
    next.src = src;
    if (next.complete) done();
  }

  function pickView(view) {
    var b = document.querySelector('.picks button[data-view="' + view + '"]');
    if (!b) return;
    document.querySelectorAll('.picks button').forEach(function (o) { o.classList.remove('is-on'); });
    b.classList.add('is-on');
    showing = view;
    putUp(view, phaseAt(hourNow()));
    if (saysEl) saysEl.textContent = b.getAttribute('data-says') || '';
    // Our own copy, written into the page above — not anything from outside.
    if (titleEl && b.getAttribute('data-title')) titleEl.innerHTML = b.getAttribute('data-title');
    // "Every feature, in full" opens the features page on the view you are on.
    if (featuresEl) featuresEl.href = 'features.html#' + view;
  }

  document.querySelectorAll('.picks button').forEach(function (b) {
    b.addEventListener('click', function () {
      chosen = true;
      pickView(b.getAttribute('data-view'));
    });
  });

  /*
   * Left alone, the screen keeps up with the hour you are scrolled to — which
   * is how you see all of the views without being asked to click anything.
   * The moment you pick one yourself, it stops second-guessing you.
   */
  var HOURS = [
    [5, 'home'], [7.5, 'mail'], [9.5, 'projects'], [11.5, 'schedule'], [13.5, 'apps'],
    [15.5, 'ask'], [17.5, 'news'], [19.5, 'travel'], [21.5, 'music'],
  ];
  var chosen = false;
  var showing = 'home';
  var litPhase = '';

  function viewByClock(hour) {
    var phase = phaseAt(hour);
    if (chosen) {
      // The view is yours, but the light in it still follows the clock.
      if (phase !== litPhase) { litPhase = phase; putUp(showing, phase); }
      return;
    }

    var view = HOURS[0][1];
    for (var i = 0; i < HOURS.length; i += 1) if (hour >= HOURS[i][0]) view = HOURS[i][1];
    if (view === showing && phase === litPhase) return;
    litPhase = phase;
    showing = view;
    pickView(view);
  }

  /* The phone is always running its loop — a dark phone on a desk is a prop. */
  var phoneClip = document.querySelector('.phone video');
  function playPhone() {
    var going = phoneClip.play();
    if (going && going.catch) going.catch(function () {});
  }
  if (phoneClip && !reduced) {
    phoneClip.preload = 'auto';
    playPhone();
    phoneClip.classList.add('is-on');
  }

  /* ── The films ────────────────────────────────────────────────────────── */

  var player = document.getElementById('player');
  var screenEl = player && player.querySelector('video');

  function playFilm(src, shape) {
    if (!screenEl) return;
    screenEl.src = src;
    screenEl.setAttribute('data-shape', shape || 'wide');
    player.classList.add('is-open');
    var g = screenEl.play();
    if (g && g.catch) g.catch(function () {});
  }
  function closeFilm() {
    if (!screenEl) return;
    player.classList.remove('is-open');
    screenEl.pause();
    setTimeout(function () {
      if (!player.classList.contains('is-open')) screenEl.removeAttribute('src');
    }, 500);
  }

  document.querySelectorAll('[data-play]').forEach(function (b) {
    b.addEventListener('click', function () { playFilm(b.getAttribute('data-play'), b.getAttribute('data-shape')); });
  });
  if (player) {
    player.querySelector('.shut').addEventListener('click', closeFilm);
    player.addEventListener('click', function (e) { if (e.target === player) closeFilm(); });
  }

  /* ── The cards ────────────────────────────────────────────────────────────
     A pile while they lie on the desk; a carousel once they are up. One is
     in front, the one either side of it is turned a little and out of focus
     behind it, and the rest wait at the back. It goes round: past the last
     update is the first again. */

  var cardEls = cardsEl ? [].slice.call(cardsEl.querySelectorAll('.card')) : [];
  var cardAt = 0;
  // A little disorder in the pile, the same every time it is put down.
  var MESS = [[-3, -4.5], [4, 3.5], [-6, 1.5], [5, -2.5], [-2, 5.5], [3, -6]];
  var bookAt = leaves.book && leaves.book.querySelector('[data-at]');
  var bookOf = leaves.book && leaves.book.querySelector('[data-of]');
  if (bookOf) bookOf.textContent = String(cardEls.length);

  function layCards(fanning) {
    var n = cardEls.length;
    var up = cardsEl.classList.contains('is-open');
    cardEls.forEach(function (c, i) {
      var d = (((i - cardAt) % n) + n) % n;   // 0 is the one you are on
      var s = c.style;
      if (!up) {
        var j = MESS[i % MESS.length];
        c.setAttribute('data-d', 'pile');
        s.setProperty('--x', j[0] + 'px');
        s.setProperty('--rz', j[1] + 'deg');
        s.setProperty('--lift', ((n - d) * 1.5).toFixed(1) + 'px');
        s.setProperty('--s', '1');
        s.setProperty('--late', (d * 0.03).toFixed(2) + 's');
        s.opacity = '1';
        s.zIndex = String(20 - d);
        return;
      }
      var w = d > n / 2 ? d - n : d;          // which side, and how far
      var side = w < 0 ? -1 : 1;
      var near = Math.abs(w) === 1;
      c.setAttribute('data-d', String(Math.max(-2, Math.min(2, w))));
      s.setProperty('--x', (w === 0 ? 0 : side * (near ? 64 : 30)) + '%');
      s.setProperty('--rz', (w === 0 ? 0 : side * (near ? 5 : 2)) + 'deg');
      s.setProperty('--lift', '0px');
      s.setProperty('--s', w === 0 ? '1' : near ? '0.84' : '0.7');
      s.setProperty('--late', fanning ? (Math.abs(w) * 0.07).toFixed(2) + 's' : '0s');
      s.opacity = Math.abs(w) <= 1 ? '1' : '0';
      s.zIndex = String(20 - Math.abs(w) * 5);
    });
    if (bookAt) bookAt.textContent = String(cardAt + 1);
  }

  function stepCards(dir) {
    var n = cardEls.length;
    cardAt = (((cardAt + dir) % n) + n) % n;
    layCards(false);
  }

  function aimCards() {
    var cx = cardsEl.offsetLeft + cardsEl.offsetWidth / 2;
    var cy = cardsEl.offsetTop + cardsEl.offsetHeight / 2;
    // The one in front, and as much of its neighbours as there is room for.
    frameBox(cx, cy - 6, narrow ? cardsEl.offsetWidth + 24 : cardsEl.offsetWidth * 2.3, cardsEl.offsetHeight + 30);
  }

  function openCards() {
    cardsEl.classList.add('is-open');
    layCards(true);
  }
  function closeCards() {
    cardsEl.classList.remove('is-open');
    layCards(false);
  }

  cardEls.forEach(function (c) {
    c.addEventListener('click', function (e) {
      if (!cardsEl.classList.contains('is-open')) return;   // the pile: it opens
      e.stopPropagation();
      var w = Number(c.getAttribute('data-d'));
      if (w === 1 || w === -1) stepCards(w);
    });
  });

  /* ── PulseNews ────────────────────────────────────────────────────────────
     Picked up, the paper stands and comes towards you; then the lower half
     swings down out of the crease. A turn takes the whole page over on the
     spine, so from the second story on it is open at a spread: the picture
     and the pull quote on the back of the page you turned, the story on the
     page in front of you. Put down, it closes again, folds, and lies back. */

  var np = paperEl && paperEl.querySelector('.np');
  var pgs = paperEl ? [].slice.call(paperEl.querySelectorAll('.pg')) : [];
  var sheet = 0;           // which story the paper is open at
  var paperTimer = 0;
  // How far it comes towards you when it is picked up: in, and up off the desk.
  var LIFT_X = -250;
  var LIFT_Y = -200;
  var P_W = 270;
  var P_H = 360;

  var stories = [];
  try { stories = JSON.parse(document.getElementById('stories').textContent); } catch (err) { stories = []; }
  var postAt = leaves.post && leaves.post.querySelector('[data-at]');
  var postOf = leaves.post && leaves.post.querySelector('[data-of]');
  var moreEl = leaves.post && leaves.post.querySelector('[data-more]');
  if (postOf) postOf.textContent = String(pgs.length);

  function sayStory() {
    if (postAt) postAt.textContent = String(sheet + 1);
    var s = stories[sheet];
    if (!s) return;
    if (moreEl) {
      moreEl.href = 'announcements.html#' + s.id;
      moreEl.setAttribute('aria-label', 'Read “' + s.hed + '” in full');
    }
    if (paperEl) paperEl.setAttribute('aria-label', 'PulseNews: ' + s.hed);
  }

  function aimPaper() {
    var x0 = paperEl.offsetLeft + LIFT_X;                // the spine, once it is up
    var y0 = paperEl.offsetTop + np.offsetTop + LIFT_Y;
    var spread = sheet > 0 && !narrow;
    // Look at the page in front of you, or the spread when there is one.
    var cx = spread ? x0 : x0 + P_W / 2;
    frameBox(cx, y0 + P_H / 2, spread ? P_W * 2 + 24 : P_W + 24, P_H + 20);
    paperEl.style.perspectiveOrigin = (cx - paperEl.offsetLeft) + 'px ' + (y0 + P_H / 2 - paperEl.offsetTop) + 'px';
  }

  function openPaper() {
    clearTimeout(paperTimer);
    np.style.setProperty('--npx', LIFT_X + 'px');
    np.style.setProperty('--npy', LIFT_Y + 'px');
    paperEl.classList.add('is-open');
    // The other pages are inside the fold; they exist once it has opened,
    // which is the lift and then the lower half's swing (see room.css).
    paperTimer = setTimeout(function () { paperEl.classList.add('is-unfolded'); }, 1350);
  }

  function closePaper() {
    clearTimeout(paperTimer);
    var wait = 0;
    if (sheet > 0) { turnPaper(0, true); wait = 760; }
    paperTimer = setTimeout(function () {
      paperEl.classList.remove('is-unfolded', 'is-open');
      np.style.removeProperty('--npx');
      np.style.removeProperty('--npy');
      paperEl.style.perspectiveOrigin = '';
    }, wait);
  }

  function turnPaper(to, quick) {
    var n = pgs.length;
    to = ((to % n) + n) % n;
    if (to === sheet || !n) return;
    paperEl.classList.add('is-unfolded');
    var forward = to > sheet;
    var list = [];
    var p;
    if (forward) for (p = sheet; p < to; p += 1) list.push(p);
    else for (p = sheet - 1; p >= to; p -= 1) list.push(p);
    list.forEach(function (idx, i) {
      var pg = pgs[idx];
      setTimeout(function () {
        pg.classList.add('is-turning');
        pg.classList.toggle('is-turned', forward);
        clearTimeout(pg.turnTimer);
        pg.turnTimer = setTimeout(function () { pg.classList.remove('is-turning'); }, 1000);
      }, i * (quick ? 80 : 170));
    });
    sheet = to;
    sayStory();
    if (openName === 'post') aimPaper();
  }

  // On the paper itself: the page in front turns forward, the one on the left turns back.
  pgs.forEach(function (pg, i) {
    pg.addEventListener('click', function (e) {
      if (!paperEl.classList.contains('is-open')) return;   // folded: it opens
      e.stopPropagation();
      turnPaper(i < sheet ? sheet - 1 : sheet + 1);
    });
  });

  /* The controls under whichever of the two is open. */
  function step(dir) {
    if (openName === 'book') stepCards(dir);
    else if (openName === 'post') turnPaper(sheet + dir);
  }
  document.querySelectorAll('.bar [data-step]').forEach(function (b) {
    b.addEventListener('click', function () { step(Number(b.getAttribute('data-step'))); });
  });
  document.addEventListener('keydown', function (e) {
    if (openName !== 'book' && openName !== 'post') return;
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  });

  /* ── The hint ─────────────────────────────────────────────────────────── */
  var hint = document.querySelector('.hint');
  var gone = false;
  function hideHint() {
    if (gone || !hint) return;
    gone = true;
    hint.classList.add('is-gone');
  }
  window.addEventListener('scroll', function () { setTimeout(hideHint, 2600); }, { passive: true, once: true });
  setTimeout(hideHint, 12000);

  if (cardsEl) layCards(false);
  sayStory();
  fit();
  window.addEventListener('resize', function () { fit(); light(); if (narrow && !open) show('screen', true); });

  light();
  rest();
  if (narrow) show('screen', true);
})();
