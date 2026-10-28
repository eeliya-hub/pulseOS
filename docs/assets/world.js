/* The hour, on the pages behind the room.
   The room's clock is driven by scrolling. Here it is the real one: the sky
   over these pages is lit for the hour you are actually reading them in. */
(function () {
  'use strict';

  var root = document.documentElement;

  var STOPS = [
    { at: 0,  top: '#070a22', low: '#191838', room: '#070912', on: 0,    stars: 1,    accent: '#a9bbff' },
    { at: 5,  top: '#171634', low: '#4a3350', room: '#0a0c18', on: 0.1,  stars: 0.5,  accent: '#ffb59c' },
    { at: 7,  top: '#2b2a5c', low: '#c4857a', room: '#141528', on: 0.6,  stars: 0.04, accent: '#ffc9a3' },
    { at: 9,  top: '#13306b', low: '#71a6c4', room: '#1a1e33', on: 0.95, stars: 0,    accent: '#9fd0ff' },
    { at: 13, top: '#0f3f8c', low: '#8fc4dd', room: '#1d2238', on: 1,    stars: 0,    accent: '#bfe2ff' },
    { at: 17, top: '#1d2f6d', low: '#c67a62', room: '#191a30', on: 0.72, stars: 0,    accent: '#ffb59c' },
    { at: 19, top: '#1b1d4a', low: '#8a4258', room: '#111226', on: 0.3,  stars: 0.18, accent: '#ffa8cf' },
    { at: 21, top: '#0d1134', low: '#2b2456', room: '#0b0d1c', on: 0.06, stars: 0.8,  accent: '#a9bbff' },
    { at: 24, top: '#070a22', low: '#191838', room: '#070912', on: 0,    stars: 1,    accent: '#a9bbff' },
  ];

  function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
  function mix(a, b, k) {
    var x = hex(a), y = hex(b);
    return 'rgb(' + x.map(function (v, i) { return Math.round(v + (y[i] - v) * k); }).join(',') + ')';
  }

  function light() {
    var now = new Date();
    var hour = now.getHours() + now.getMinutes() / 60;

    var a = STOPS[0], b = STOPS[STOPS.length - 1];
    for (var i = 0; i < STOPS.length - 1; i += 1) {
      if (hour >= STOPS[i].at && hour <= STOPS[i + 1].at) { a = STOPS[i]; b = STOPS[i + 1]; break; }
    }
    var k = a === b ? 0 : (hour - a.at) / (b.at - a.at);
    var e = k * k * (3 - 2 * k);

    root.style.setProperty('--sky-top', mix(a.top, b.top, e));
    root.style.setProperty('--sky-low', mix(a.low, b.low, e));
    root.style.setProperty('--room', mix(a.room, b.room, e));
    root.style.setProperty('--accent', mix(a.accent, b.accent, e));
    root.style.setProperty('--light-on', (a.on + (b.on - a.on) * e).toFixed(3));
    root.style.setProperty('--stars', (a.stars + (b.stars - a.stars) * e).toFixed(3));

    var day = (hour - 6) / 14;
    var up = day >= 0 && day <= 1;
    var high = up ? Math.sin(day * Math.PI) : 0;
    root.style.setProperty('--sun-x', (10 + day * 80).toFixed(1) + '%');
    root.style.setProperty('--sun-y', (104 - high * 72).toFixed(1) + '%');
    root.style.setProperty('--sun-glow', (up ? 0.25 + high * 0.55 : 0).toFixed(2));

    var clock = document.querySelector('[data-clock]');
    var half = document.querySelector('[data-half]');
    if (clock) {
      var h = now.getHours();
      clock.textContent = String(h).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      if (half) half.textContent = h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night';
    }
  }

  light();
  setInterval(light, 30000);

  /* Things arrive as they come into view, once. */
  var risers = [].slice.call(document.querySelectorAll('.rise'));
  if (!('IntersectionObserver' in window)) {
    risers.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var eye = new IntersectionObserver(function (rows) {
      rows.forEach(function (row) {
        if (!row.isIntersecting) return;
        row.target.classList.add('is-in');
        eye.unobserve(row.target);
      });
    }, { rootMargin: '0px 0px -12% 0px' });
    risers.forEach(function (el) { eye.observe(el); });
  }

  /*
   * Features and announcements: one panel at a time, chosen from the row of
   * tabs (or cards) above them, and from the before-and-after links at the
   * foot of each. The address carries the choice, so the room can link
   * straight to a view or a story, and the back button still works.
   */
  var panels = [].slice.call(document.querySelectorAll('.panel'));
  var switcher = document.querySelector('[data-switch]');
  if (panels.length && switcher) {
    var tabs = [].slice.call(switcher.querySelectorAll('a[href^="#"]'));
    switcher.setAttribute('role', 'tablist');
    tabs.forEach(function (t) {
      t.setAttribute('role', 'tab');
      t.setAttribute('aria-controls', t.getAttribute('href').slice(1));
    });
    panels.forEach(function (p) { p.setAttribute('role', 'tabpanel'); });

    var current = '';
    var choose = function (id, scroll) {
      var panel = document.getElementById(id);
      if (!panel || panels.indexOf(panel) < 0) { panel = panels[0]; id = panel.id; }
      if (id !== current) {
        panels.forEach(function (p) {
          var on = p === panel;
          p.hidden = !on;
          if (on && current) {
            p.classList.remove('is-entering');
            void p.offsetWidth;
            p.classList.add('is-entering');
          }
        });
        tabs.forEach(function (t) {
          var on = t.getAttribute('href') === '#' + id;
          t.setAttribute('aria-selected', on ? 'true' : 'false');
          t.tabIndex = on ? 0 : -1;
          if (on && t.scrollIntoView && switcher.classList.contains('switch')) {
            t.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
          }
        });
        // Things inside it rise in as they come into view, like the rest.
        panel.querySelectorAll('.rise').forEach(function (el) { el.classList.add('is-in'); });
        current = id;
      }
      // Bring the top of it into view, but only if you have read past it.
      if (scroll && panel.getBoundingClientRect().top < 0) panel.scrollIntoView({ block: 'start' });
      if (scroll === 'jump') panel.scrollIntoView({ block: 'start' });
    };

    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute('href').slice(1);
      var panel = document.getElementById(id);
      if (!panel || panels.indexOf(panel) < 0) return;
      e.preventDefault();
      if (history.replaceState) history.replaceState(null, '', '#' + id);
      // From the foot of a panel or from the cards, go to the top of the new one.
      choose(id, a.closest('.panel-nav') || a.closest('.index') ? 'jump' : true);
    });
    // Arrow keys move along the tabs, as tabs do.
    switcher.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      var next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.focus();
      next.click();
    });
    window.addEventListener('hashchange', function () { choose(location.hash.slice(1), 'jump'); });
    var asked = location.hash.slice(1);
    choose(asked, false);
    if (asked && document.getElementById(asked)) {
      // Arriving at a link to one: start at it, not at the top of the page.
      requestAnimationFrame(function () { document.getElementById(current).scrollIntoView({ block: 'start' }); });
    }
  }

  /* The updates page filters itself in place. */
  var chips = document.querySelectorAll('.chips button');
  if (chips.length) {
    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        var kind = chip.getAttribute('data-kind');
        chips.forEach(function (o) { o.classList.toggle('is-on', o === chip); });
        document.querySelectorAll('.entry').forEach(function (entry) {
          entry.hidden = kind !== 'all' && entry.getAttribute('data-kind') !== kind;
        });
        document.querySelectorAll('.month').forEach(function (m) {
          var seen = false;
          var el = m.nextElementSibling;
          while (el && !el.classList.contains('month')) {
            if (el.classList.contains('entry') && !el.hidden) seen = true;
            el = el.nextElementSibling;
          }
          m.hidden = !seen;
        });
      });
    });
  }
})();
