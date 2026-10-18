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

  /* ── The tour ─────────────────────────────────────────────────────────────
     A proper tab list over the nine views: arrow keys move along it, the
     panels are real elements that are hidden rather than rebuilt (so the
     screenshots stay cached and a screen reader is told which one is showing),
     and the address bar follows, so a view can be linked to. */
  var rail = document.querySelector('[data-tour]');
  if (rail) {
    var tabs = Array.prototype.slice.call(rail.querySelectorAll('[role="tab"]'));

    var show = function (tab, focus) {
      if (!tab) return;
      tabs.forEach(function (other) {
        var on = other === tab;
        other.setAttribute('aria-selected', on ? 'true' : 'false');
        other.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(other.getAttribute('aria-controls'));
        if (!panel) return;
        // Un-hiding restarts the panel's own entry animation, because an
        // element coming back from display:none replays it.
        panel.hidden = !on;
      });
      keepInView(tab);
      if (focus) tab.focus();
    };

    /* Narrow enough that the rail is a row of chips: bring the selected one
       into view inside the rail. Only the rail scrolls — the page must not
       move under the hand that just tapped. */
    var keepInView = function (tab) {
      if (rail.scrollWidth <= rail.clientWidth + 1) return;
      var left = tab.offsetLeft - (rail.clientWidth - tab.offsetWidth) / 2;
      rail.scrollTo({ left: Math.max(0, left), behavior: reduced ? 'auto' : 'smooth' });
    };

    var byPanel = function (id) {
      return tabs.filter(function (tab) { return tab.getAttribute('aria-controls') === id; })[0];
    };

    tabs.forEach(function (tab, index) {
      tab.addEventListener('click', function () {
        show(tab, false);
        // replaceState rather than a hash jump: selecting a view should not
        // scroll the page out from under the hand that selected it.
        if (window.history.replaceState) {
          window.history.replaceState(null, '', '#' + tab.getAttribute('aria-controls'));
        }
      });
      tab.addEventListener('keydown', function (event) {
        var step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
          : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
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

    /* Arriving at a view, from the cards up the page or from an announcement.
       The tour is tabs rather than a stack, so a bare #mail would otherwise
       land on a panel that is hidden. */
    var fromHash = function (scroll) {
      var id = decodeURIComponent(window.location.hash.slice(1));
      var tab = id && byPanel(id);
      if (!tab) return;
      show(tab, false);
      if (scroll) {
        var tour = document.getElementById('tour');
        if (tour) tour.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      }
    };
    fromHash(false);
    keepInView(rail.querySelector('[aria-selected="true"]') || tabs[0]);
    window.addEventListener('hashchange', function () { fromHash(true); });
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

  /* ── Filtering the updates ────────────────────────────────────────────────
     Sixty-odd entries down one column is a lot to read when you came looking
     for one kind of thing. The filter hides rather than removes, so a month
     that empties still says so. Without JS every entry is simply shown, which
     is the behaviour worth having anyway. */
  var filters = document.querySelector('[data-filters]');
  if (filters) {
    var entries = Array.prototype.slice.call(document.querySelectorAll('.update'));
    var months = Array.prototype.slice.call(document.querySelectorAll('.update-month'));
    var empty = document.querySelector('[data-no-matches]');

    var apply = function (kind) {
      entries.forEach(function (entry) {
        entry.hidden = kind !== 'all' && entry.getAttribute('data-kind') !== kind;
      });
      // A month heading with nothing under it any more goes too.
      months.forEach(function (month) {
        var shown = 0;
        for (var el = month.nextElementSibling; el && el.classList.contains('update'); el = el.nextElementSibling) {
          if (!el.hidden) shown += 1;
        }
        month.hidden = shown === 0;
      });
      if (empty) empty.hidden = entries.some(function (entry) { return !entry.hidden; });
    };

    Array.prototype.forEach.call(filters.querySelectorAll('button'), function (button) {
      button.addEventListener('click', function () {
        Array.prototype.forEach.call(filters.querySelectorAll('button'), function (other) {
          other.setAttribute('aria-pressed', other === button ? 'true' : 'false');
        });
        apply(button.getAttribute('data-kind'));
      });
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
