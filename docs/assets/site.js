/* ───────────────────────────────────────────────────────────────────────────
   Pulse OS — the site

   No framework and no build step: this is a handful of pages on GitHub Pages,
   and everything here is small enough to read in one sitting. Each piece is
   optional — a page without tabs simply has none to wire up.
   ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── The hour ─────────────────────────────────────────────────────────────
     The app's background follows the time of day, so the site's does too —
     from the VISITOR's clock, not the server's. Someone opening this at dusk
     in Auckland gets the dusk they are actually in, which is the whole idea
     and costs one attribute.  */
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
  // Re-check on the minute rather than on a timer of its own: a page left open
  // through sunset should catch up with it.
  setInterval(sky, 60000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) sky();
  });

  /* ── The bar ────────────────────────────────────────────────────────────── */
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
     Anything marked .reveal settles in when it is reached. Also what starts
     the diagram, so its wires are not already running before anyone sees
     them. */
  var targets = document.querySelectorAll('.reveal, .wires');
  if (reduced || !('IntersectionObserver' in window)) {
    Array.prototype.forEach.call(targets, function (el) {
      el.classList.add('is-in');
    });
  } else {
    var watcher = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-in');
          // One way only: a section does not un-arrive when scrolled past.
          watcher.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
    );
    Array.prototype.forEach.call(targets, function (el) {
      watcher.observe(el);
    });
  }

  /* ── The feature switcher ─────────────────────────────────────────────────
     A proper tab list: arrow keys move between them, and the panels are real
     elements that are hidden rather than rebuilt, so the images stay cached
     and a screen reader is told which one is showing. */
  var tablist = document.querySelector('[role="tablist"]');
  if (tablist) {
    var tabs = Array.prototype.slice.call(tablist.querySelectorAll('[role="tab"]'));

    var show = function (tab, focus) {
      tabs.forEach(function (other) {
        var on = other === tab;
        other.setAttribute('aria-selected', on ? 'true' : 'false');
        other.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(other.getAttribute('aria-controls'));
        if (!panel) return;
        panel.hidden = !on;
        if (on && !reduced) {
          // Restart the entry animation for the panel being shown.
          panel.classList.remove('fades');
          void panel.offsetWidth;
          panel.classList.add('fades');
        }
      });
      if (focus) tab.focus();
    };

    tabs.forEach(function (tab, index) {
      tab.addEventListener('click', function () {
        show(tab, false);
      });
      tab.addEventListener('keydown', function (event) {
        var step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (step) {
          event.preventDefault();
          show(tabs[(index + step + tabs.length) % tabs.length], true);
        } else if (event.key === 'Home') {
          event.preventDefault();
          show(tabs[0], true);
        } else if (event.key === 'End') {
          event.preventDefault();
          show(tabs[tabs.length - 1], true);
        }
      });
    });
  }

  /* ── Which section you are in ─────────────────────────────────────────────
     The bar's links light up as you pass their section, so the page says
     where you are without a scrollbar's worth of guessing. */
  var links = Array.prototype.slice.call(document.querySelectorAll('.nav a[href^="#"]'));
  if (links.length && 'IntersectionObserver' in window) {
    var sections = links
      .map(function (link) {
        return document.querySelector(link.getAttribute('href'));
      })
      .filter(Boolean);

    var spy = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          links.forEach(function (link) {
            link.toggleAttribute('aria-current', link.getAttribute('href') === '#' + entry.target.id);
          });
        });
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    sections.forEach(function (section) {
      spy.observe(section);
    });
  }

  /* ── Copy a link ──────────────────────────────────────────────────────────
     For sharing a post without reaching for the address bar. Falls back to
     doing nothing visible rather than throwing where the clipboard is
     unavailable (an insecure origin, mostly). */
  Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function (button) {
    button.addEventListener('click', function () {
      var url = button.getAttribute('data-copy') || window.location.href;
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(url).then(function () {
        var was = button.textContent;
        button.textContent = 'Link copied';
        setTimeout(function () {
          button.textContent = was;
        }, 1800);
      });
    });
  });
})();
