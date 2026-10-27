/* ───────────────────────────────────────────────────────────────────────────
   Pulse OS — the front page

   Four small things, none of which need a framework: the hour the visitor is
   actually in, the bar settling as you leave the top, surfaces arriving as
   they are reached, and the films — a silent loop on the card, the whole
   thing in a player when you ask for it.

   Everything degrades: with JavaScript off the posters still show, the links
   still work, and the only thing lost is the motion.
   ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── The hour ─────────────────────────────────────────────────────────────
     The app's background follows the time of day, so the site's does too, from
     the VISITOR's clock. Someone opening this at dusk in Auckland gets the dusk
     they are actually in, which is the whole idea and costs one attribute. */
  var HOURS = [
    { id: 'night', from: 0, says: 'Lit for the small hours' },
    { id: 'dawn', from: 5, says: 'Lit for dawn' },
    { id: 'day', from: 8, says: 'Lit for the middle of the day' },
    { id: 'dusk', from: 17, says: 'Lit for dusk' },
    { id: 'night', from: 20, says: 'Lit for tonight' },
  ];

  function sky() {
    var hour = new Date().getHours();
    var band = HOURS[0];
    for (var i = 0; i < HOURS.length; i += 1) if (hour >= HOURS[i].from) band = HOURS[i];
    document.documentElement.setAttribute('data-sky', band.id);

    var label = document.querySelector('[data-hour-says]');
    if (label) {
      var time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      label.textContent = band.says + ' — it is ' + time + ' where you are';
    }
  }

  sky();
  // On the minute, not on a timer of its own: a page left open through sunset
  // should catch up with it.
  setInterval(sky, 60000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) sky();
  });

  /* ── The bar ───────────────────────────────────────────────────────────── */
  var scrolled = false;
  function onScroll() {
    var past = window.scrollY > 24;
    if (past === scrolled) return;
    scrolled = past;
    document.body.classList.toggle('is-scrolled', past);
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ── Arriving ─────────────────────────────────────────────────────────────
     Anything marked .reveal settles in when it is reached, once. Without an
     observer — or with reduced motion — everything is simply already there. */
  var reveals = [].slice.call(document.querySelectorAll('.reveal'));
  if (reduced || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var watcher = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-in');
          watcher.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
    );
    reveals.forEach(function (el) { watcher.observe(el); });
  }

  /* ── The loops ────────────────────────────────────────────────────────────
     A few silent seconds of each film, fetched only once the card is near the
     screen and only on a machine that is not asking us to keep still. They sit
     over their own poster and fade in, so there is never a flash of nothing,
     and they pause while the tab is in the background or the card is away. */
  var cards = [].slice.call(document.querySelectorAll('.film'));

  function loopIn(card) {
    var clip = card.querySelector('video');
    if (!clip || reduced) return;
    if (clip.preload !== 'auto') clip.preload = 'auto';
    var going = clip.play();
    if (going && going.catch) going.catch(function () { /* a browser that would rather not; the poster stands */ });
    clip.classList.add('is-playing');
  }

  function loopOut(card) {
    var clip = card.querySelector('video');
    if (!clip) return;
    clip.pause();
    clip.classList.remove('is-playing');
  }

  if (!reduced && 'IntersectionObserver' in window) {
    var loops = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) loopIn(entry.target);
          else loopOut(entry.target);
        });
      },
      { threshold: 0.25 },
    );
    cards.forEach(function (card) { if (card.querySelector('video')) loops.observe(card); });
  }

  document.addEventListener('visibilitychange', function () {
    cards.forEach(document.hidden ? loopOut : function () { /* the observer brings them back */ });
  });

  /* ── The player ──────────────────────────────────────────────────────────
     One <video> for every film: the card hands it a source and its shape, and
     the page behind it stops scrolling while it is open. */
  var player = document.getElementById('player');
  var screenEl = player && player.querySelector('video');
  var shut = player && player.querySelector('.shut');
  var cameFrom = null;

  function open(card) {
    if (!player || !screenEl) return;
    screenEl.src = card.getAttribute('data-film');
    screenEl.setAttribute('data-shape', card.getAttribute('data-shape') || 'wide');
    cameFrom = card;
    player.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    var going = screenEl.play();
    if (going && going.catch) going.catch(function () { /* they can press play themselves */ });
    if (shut) shut.focus();
  }

  function close() {
    if (!player || !screenEl) return;
    player.classList.remove('is-open');
    screenEl.pause();
    document.body.style.overflow = '';
    // Let the fade finish before the source goes, or the frame blinks out.
    setTimeout(function () {
      if (!player.classList.contains('is-open')) screenEl.removeAttribute('src');
    }, 500);
    if (cameFrom) cameFrom.focus();
    cameFrom = null;
  }

  cards.forEach(function (card) {
    if (!card.getAttribute('data-film')) return;
    card.addEventListener('click', function () { open(card); });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open(card);
      }
    });
  });

  if (shut) shut.addEventListener('click', close);
  if (player) {
    player.addEventListener('click', function (e) {
      if (e.target === player) close();
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && player && player.classList.contains('is-open')) close();
  });
})();
