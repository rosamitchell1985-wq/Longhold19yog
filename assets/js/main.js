/* ==========================================================================
   Longhold Yoga - shared behavior
   Vanilla JS, no dependencies, no build step.
   Modules: nav, dropdown, breath pacer, reveal, accordion, filters,
            sequence player, forms, cookie consent, back-to-top.
   Everything degrades to working HTML if JS fails.
   ========================================================================== */
(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  /* ------------------------------------------------------------------------
     1. Mobile navigation
     ------------------------------------------------------------------------ */
  function initNav() {
    var toggle = $('.nav-toggle');
    var nav = $('#primary-nav');
    if (!toggle || !nav) return;

    function setOpen(open) {
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      $('.nav-toggle__glyph', toggle).textContent = open ? '✕' : '☰';
      $('.nav-toggle__text', toggle).textContent = open ? 'Close' : 'Menu';
    }

    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
        toggle.focus();
      }
    });

    // Reset drawer state when crossing into desktop layout
    var desktop = window.matchMedia('(min-width: 1024px)');
    function sync() { if (desktop.matches) setOpen(false); }
    if (desktop.addEventListener) desktop.addEventListener('change', sync);
  }

  /* ------------------------------------------------------------------------
     2. Nav dropdown ("Learn")
     ------------------------------------------------------------------------ */
  function initDropdowns() {
    $$('.nav__group').forEach(function (group) {
      var trigger = $('.nav__trigger', group);
      var menu = $('.nav__menu', group);
      if (!trigger || !menu) return;

      function open(state) {
        trigger.setAttribute('aria-expanded', state ? 'true' : 'false');
        menu.hidden = !state;
      }

      trigger.addEventListener('click', function (e) {
        e.stopPropagation();
        open(trigger.getAttribute('aria-expanded') !== 'true');
      });

      group.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { open(false); trigger.focus(); }
      });

      document.addEventListener('click', function (e) {
        if (!group.contains(e.target)) open(false);
      });

      // Pointer users get hover on desktop, but click still works everywhere
      var desktop = window.matchMedia('(min-width: 1024px)');
      group.addEventListener('mouseenter', function () { if (desktop.matches) open(true); });
      group.addEventListener('mouseleave', function () { if (desktop.matches) open(false); });
    });
  }

  /* ------------------------------------------------------------------------
     3. Signature detail: breath-pacing bar
     Reads the pattern from data attributes on .breath-bar so each page can
     pace its own sequence. Counts inhale / hold / exhale in seconds.
     ------------------------------------------------------------------------ */
  function initBreathBar() {
    var bar = $('.breath-bar');
    if (!bar) return;

    var fill = $('.breath-fill', bar);
    var countEl = $('.breath-count', bar);
    var toggle = $('.breath-toggle', bar);
    if (!fill || !countEl || !toggle) return;

    var inhale = parseFloat(bar.dataset.inhale || '4');
    var holdIn = parseFloat(bar.dataset.hold || '0');
    var exhale = parseFloat(bar.dataset.exhale || '6');
    var holdOut = parseFloat(bar.dataset.holdOut || '0');

    var phases = [
      { name: 'Inhale', secs: inhale, dir: 'up' },
      { name: 'Hold', secs: holdIn, dir: 'hold' },
      { name: 'Exhale', secs: exhale, dir: 'down' },
      { name: 'Rest', secs: holdOut, dir: 'hold' }
    ].filter(function (p) { return p.secs > 0; });

    var idx = 0;
    var start = null;
    var running = false;
    var raf = null;

    function render(phase, elapsed) {
      var pct;
      if (phase.dir === 'up') pct = (elapsed / phase.secs) * 100;
      else if (phase.dir === 'down') pct = 100 - (elapsed / phase.secs) * 100;
      else pct = phase.name === 'Hold' ? 100 : 0;
      fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
      var remain = Math.max(1, Math.ceil(phase.secs - elapsed));
      countEl.textContent = phase.name + ' · ' + remain + ' of ' + phase.secs;
    }

    function frame(ts) {
      if (!running) return;
      if (start === null) start = ts;
      var phase = phases[idx];
      var elapsed = (ts - start) / 1000;
      if (elapsed >= phase.secs) {
        idx = (idx + 1) % phases.length;
        start = ts;
        elapsed = 0;
        phase = phases[idx];
      }
      render(phase, elapsed);
      raf = window.requestAnimationFrame(frame);
    }

    function setRunning(state) {
      running = state;
      toggle.setAttribute('aria-pressed', state ? 'true' : 'false');
      toggle.textContent = state ? 'Pause pacing' : 'Start pacing';
      if (state) {
        start = null;
        raf = window.requestAnimationFrame(frame);
      } else if (raf) {
        window.cancelAnimationFrame(raf);
        raf = null;
      }
    }

    toggle.addEventListener('click', function () { setRunning(!running); });

    // Static, honest default under reduced motion: show the pattern, do not animate.
    function applyMotionPreference() {
      if (prefersReducedMotion.matches) {
        if (running) setRunning(false);
        fill.style.width = '0%';
        countEl.textContent = phases.map(function (p) { return p.name + ' ' + p.secs; }).join(' · ');
        toggle.hidden = true;
      } else {
        toggle.hidden = false;
        if (!running) {
          countEl.textContent = phases.map(function (p) { return p.name + ' ' + p.secs; }).join(' · ');
        }
      }
    }
    if (prefersReducedMotion.addEventListener) {
      prefersReducedMotion.addEventListener('change', applyMotionPreference);
    }
    applyMotionPreference();

    // Pause when the tab is hidden so the count does not drift
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && running) setRunning(false);
    });
  }

  /* ------------------------------------------------------------------------
     4. Section reveal (250ms fade and rise)
     Content is visible by default. We only opt in when IO is available.
     ------------------------------------------------------------------------ */
  function initReveal() {
    var targets = $$('.reveal');
    if (!targets.length) return;
    if (prefersReducedMotion.matches || !('IntersectionObserver' in window)) return;

    document.documentElement.classList.add('js-reveal');

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });

    targets.forEach(function (el) { io.observe(el); });
  }

  /* ------------------------------------------------------------------------
     5. Accordions (FAQ and elsewhere)
     ------------------------------------------------------------------------ */
  function initAccordions() {
    $$('.accordion__btn').forEach(function (btn) {
      var panel = document.getElementById(btn.getAttribute('aria-controls'));
      if (!panel) return;
      btn.addEventListener('click', function () {
        var open = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', open ? 'false' : 'true');
        panel.hidden = open;
      });
    });
  }

  /* ------------------------------------------------------------------------
     6. Pose library filter (difficulty / body area / prop)
     ------------------------------------------------------------------------ */
  function initPoseFilter() {
    var form = $('#pose-filters');
    if (!form) return;

    var rows = $$('[data-pose]');
    var status = $('#filter-status');
    var empty = $('#filter-empty');
    var search = $('#f-search');
    var level = $('#f-level');
    var area = $('#f-area');
    var prop = $('#f-prop');
    var reset = $('#f-reset');

    function matches(row) {
      var q = (search.value || '').trim().toLowerCase();
      if (q) {
        var hay = (row.dataset.name + ' ' + row.dataset.sanskrit).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      if (level.value && row.dataset.level !== level.value) return false;
      if (area.value && row.dataset.area.split(' ').indexOf(area.value) === -1) return false;
      if (prop.value && row.dataset.prop.split(' ').indexOf(prop.value) === -1) return false;
      return true;
    }

    function apply() {
      var shown = 0;
      rows.forEach(function (row) {
        var ok = matches(row);
        row.hidden = !ok;
        if (ok) shown++;
      });
      status.textContent = shown === rows.length
        ? 'Showing all ' + rows.length + ' poses.'
        : 'Showing ' + shown + ' of ' + rows.length + ' poses.';
      if (empty) empty.hidden = shown !== 0;
    }

    [search, level, area, prop].forEach(function (el) {
      if (!el) return;
      el.addEventListener('input', apply);
      el.addEventListener('change', apply);
    });

    if (reset) {
      reset.addEventListener('click', function () {
        form.reset();
        apply();
        search.focus();
      });
    }

    form.addEventListener('submit', function (e) { e.preventDefault(); apply(); });
    apply();
  }

  /* ------------------------------------------------------------------------
     7. Sequence player - per-pose hold timers with pause
     Reads the pose order from the .seq-list already in the HTML, so the
     printed and screen-read versions can never disagree.
     ------------------------------------------------------------------------ */
  function initSequencePlayer() {
    var player = $('#sequence-player');
    var list = $('#sequence-list');
    if (!player || !list) return;

    var items = $$('li[data-seconds]', list);
    if (!items.length) return;

    var nameEl = $('.player__now', player);
    var sideEl = $('.player__side', player);
    var clockEl = $('.player__clock', player);
    var barEl = $('.player__bar', player);
    var cueEl = $('.player__cue', player);
    var startBtn = $('#player-start');
    var skipBtn = $('#player-skip');
    var backBtn = $('#player-back');
    var resetBtn = $('#player-reset');

    var idx = 0;
    var remaining = 0;
    var running = false;
    var tick = null;

    function seconds(i) { return parseInt(items[i].dataset.seconds, 10) || 30; }

    function fmt(s) {
      var m = Math.floor(s / 60);
      var r = s % 60;
      return m + ':' + (r < 10 ? '0' : '') + r;
    }

    function paint() {
      var li = items[idx];
      var total = seconds(idx);
      nameEl.textContent = li.dataset.name;
      sideEl.textContent = 'Pose ' + (idx + 1) + ' of ' + items.length +
        (li.dataset.sanskrit ? ' · ' + li.dataset.sanskrit : '');
      clockEl.textContent = fmt(remaining);
      barEl.style.width = (total ? ((total - remaining) / total) * 100 : 0) + '%';
      cueEl.textContent = li.dataset.cue || '';
      items.forEach(function (el, i) { el.classList.toggle('is-current', i === idx); });
    }

    function stop() {
      running = false;
      if (tick) { window.clearInterval(tick); tick = null; }
      startBtn.textContent = 'Start practice';
      startBtn.setAttribute('aria-pressed', 'false');
    }

    function advance(step) {
      var next = idx + step;
      if (next < 0) next = 0;
      if (next >= items.length) {
        stop();
        idx = items.length - 1;
        remaining = 0;
        paint();
        nameEl.textContent = 'Practice complete';
        sideEl.textContent = 'Rest as long as you need before you stand up.';
        cueEl.textContent = 'Take a moment before you move on.';
        return;
      }
      idx = next;
      remaining = seconds(idx);
      paint();
    }

    function start() {
      running = true;
      startBtn.textContent = 'Pause';
      startBtn.setAttribute('aria-pressed', 'true');
      tick = window.setInterval(function () {
        remaining -= 1;
        if (remaining <= 0) { advance(1); if (!running) return; }
        paint();
      }, 1000);
    }

    startBtn.addEventListener('click', function () {
      if (running) stop(); else start();
    });
    skipBtn.addEventListener('click', function () { advance(1); });
    backBtn.addEventListener('click', function () { advance(-1); });
    resetBtn.addEventListener('click', function () {
      stop();
      idx = 0;
      remaining = seconds(0);
      paint();
    });

    // Clicking a row in the printed order jumps the timer there. Clicks that
    // land on a link inside the row are left alone so the link still works.
    items.forEach(function (li, i) {
      li.addEventListener('click', function (e) {
        if (e.target.closest('a')) return;
        idx = i;
        remaining = seconds(i);
        paint();
      });
    });

    remaining = seconds(0);
    paint();
  }

  /* ------------------------------------------------------------------------
     8. Form validation with inline messages
     ------------------------------------------------------------------------ */
  function initForms() {
    $$('form[data-validate]').forEach(function (form) {
      var status = $('.form-status', form);

      // A field wrapper is either .field (text inputs) or .checkline (checkboxes).
      // Checkbox error text lives in the .field__error immediately after the
      // .checkline, so errorOf() looks inside first, then at the next sibling.
      function fieldOf(input) { return input.closest('.field') || input.closest('.checkline'); }

      function errorOf(wrap) {
        var el = $('.field__error', wrap);
        if (el) return el;
        var next = wrap.nextElementSibling;
        if (next && next.classList.contains('field__error')) return next;
        return null;
      }

      function messageFor(input) {
        if (input.validity.valueMissing) return input.dataset.msgRequired || 'This field is required.';
        if (input.validity.typeMismatch && input.type === 'email') return 'Enter an email address in the format name@example.com.';
        if (input.validity.tooShort) return 'Please use at least ' + input.minLength + ' characters.';
        if (input.validity.patternMismatch) return input.dataset.msgPattern || 'Please check the format of this entry.';
        return 'Please check this field.';
      }

      function validate(input) {
        var wrap = fieldOf(input);
        if (!wrap) return input.checkValidity();
        var errEl = errorOf(wrap);
        var ok = input.checkValidity();
        wrap.classList.toggle('has-error', !ok);
        if (errEl) {
          errEl.textContent = ok ? '' : messageFor(input);
          errEl.style.display = ok ? '' : 'block';
        }
        input.setAttribute('aria-invalid', ok ? 'false' : 'true');
        return ok;
      }

      $$('input, select, textarea', form).forEach(function (input) {
        input.addEventListener('blur', function () { validate(input); });
        input.addEventListener('input', function () {
          var wrap = fieldOf(input);
          if (wrap && wrap.classList.contains('has-error')) validate(input);
        });
      });

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var fields = $$('input, select, textarea', form);
        var firstBad = null;
        fields.forEach(function (input) {
          if (!validate(input) && !firstBad) firstBad = input;
        });
        if (firstBad) {
          firstBad.focus();
          if (status) { status.classList.remove('is-visible'); }
          return;
        }
        if (status) {
          status.textContent = form.dataset.successMessage ||
            'Thank you. Your message has been received and we reply within two business days.';
          status.classList.add('is-visible');
          status.setAttribute('tabindex', '-1');
          status.focus();
        }
        form.reset();
      });
    });
  }

  /* ------------------------------------------------------------------------
     9. Cookie consent
     No non-essential cookie or third-party tag is set before a choice is made.
     ------------------------------------------------------------------------ */
  var CONSENT_KEY = 'longhold-consent-v1';

  function readConsent() {
    try { return JSON.parse(window.localStorage.getItem(CONSENT_KEY)); }
    catch (err) { return null; }
  }

  function writeConsent(value) {
    try { window.localStorage.setItem(CONSENT_KEY, JSON.stringify(value)); }
    catch (err) { /* storage blocked: banner reappears next visit, which is correct */ }
  }

  function initCookieBanner() {
    var banner = $('#cookie-banner');
    if (!banner) return;

    var prefs = $('#cookie-prefs', banner);
    var acceptBtn = $('#cookie-accept', banner);
    var rejectBtn = $('#cookie-reject', banner);
    var manageBtn = $('#cookie-manage', banner);
    var saveBtn = $('#cookie-save', banner);
    var analyticsBox = $('#cookie-analytics', banner);
    var adsBox = $('#cookie-ads', banner);

    var existing = readConsent();
    if (!existing) {
      banner.hidden = false;
    }

    function decide(value) {
      writeConsent({ analytics: !!value.analytics, ads: !!value.ads, ts: Date.now() });
      banner.hidden = true;
      // Advertising and analytics tags load only from here, never earlier.
      if (value.analytics || value.ads) {
        document.dispatchEvent(new CustomEvent('consent:granted', { detail: value }));
      }
    }

    if (acceptBtn) acceptBtn.addEventListener('click', function () { decide({ analytics: true, ads: true }); });
    if (rejectBtn) rejectBtn.addEventListener('click', function () { decide({ analytics: false, ads: false }); });
    if (manageBtn) manageBtn.addEventListener('click', function () {
      var open = manageBtn.getAttribute('aria-expanded') === 'true';
      manageBtn.setAttribute('aria-expanded', open ? 'false' : 'true');
      prefs.hidden = open;
    });
    if (saveBtn) saveBtn.addEventListener('click', function () {
      decide({ analytics: analyticsBox && analyticsBox.checked, ads: adsBox && adsBox.checked });
    });

    // Any "cookie settings" link on the site reopens the banner
    $$('[data-cookie-settings]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        banner.hidden = false;
        if (prefs) { prefs.hidden = false; }
        if (manageBtn) manageBtn.setAttribute('aria-expanded', 'true');
        var stored = readConsent();
        if (stored) {
          if (analyticsBox) analyticsBox.checked = !!stored.analytics;
          if (adsBox) adsBox.checked = !!stored.ads;
        }
        banner.scrollIntoView({ block: 'end' });
        if (acceptBtn) acceptBtn.focus();
      });
    });
  }

  /* ------------------------------------------------------------------------
     10. Back to top
     ------------------------------------------------------------------------ */
  function initBackToTop() {
    var btn = $('#back-to-top');
    if (!btn) return;

    // IntersectionObserver on a sentinel, not a scroll listener
    var sentinel = document.createElement('div');
    sentinel.style.cssText = 'position:absolute;top:600px;left:0;width:1px;height:1px;pointer-events:none;';
    document.body.appendChild(sentinel);

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        btn.classList.toggle('is-visible', !entries[0].isIntersecting);
      });
      io.observe(sentinel);
    } else {
      btn.classList.add('is-visible');
    }

    btn.addEventListener('click', function () {
      window.scrollTo({
        top: 0,
        behavior: prefersReducedMotion.matches ? 'auto' : 'smooth'
      });
      var skip = $('.skip-link');
      if (skip) skip.focus();
    });
  }

  /* ------------------------------------------------------------------------
     11. Current year in footers
     ------------------------------------------------------------------------ */
  function initYear() {
    $$('[data-year]').forEach(function (el) {
      el.textContent = String(new Date().getFullYear());
    });
  }

  /* ------------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------------ */
  function boot() {
    initNav();
    initDropdowns();
    initBreathBar();
    initReveal();
    initAccordions();
    initPoseFilter();
    initSequencePlayer();
    initForms();
    initCookieBanner();
    initBackToTop();
    initYear();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
