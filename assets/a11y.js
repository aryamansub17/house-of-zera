/* =============================================================================
   Inclusively Zera — accessibility layer
   -----------------------------------------------------------------------------
   Owns every accessibility preference, the speech engine, the audio guide,
   the sound cues, voice control, the reading ruler and the keyboard shortcuts.

   Design rules this file follows:
   - Nothing here is required for the shop to work. Every feature degrades to
     "the page still works, the control just isn't offered".
   - Preferences persist in localStorage under one key, and are applied to
     <html> as data-* attributes and CSS custom properties, so styling stays in
     a11y.css rather than being written from JavaScript.
   - Speech is never started without a user gesture, and Escape always stops it.
   ============================================================================= */
(function () {
  'use strict';

  var root = document.documentElement;
  var KEY = 'zera.a11y.v1';

  /* ---------------------------------------------------------------------------
     Preferences
     --------------------------------------------------------------------------- */
  var defaults = {
    theme: 'light',          // light | dark | high
    scale: 100,              // percent
    lineHeight: 1.6,
    letterSpacing: 0,
    dyslexia: false,
    underline: false,
    boldFocus: false,
    ruler: false,
    motion: null,            // null = follow the system, true = reduced
    largeTargets: false,
    tts: false,
    ttsVoice: '',
    ttsRate: 1,
    ttsPitch: 1,
    earcons: true,
    earconVolume: 40,
    voiceControl: false
  };

  var prefs = load();

  function load() {
    var out = {};
    for (var k in defaults) out[k] = defaults[k];
    try {
      var raw = window.localStorage.getItem(KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        for (var j in saved) if (j in defaults) out[j] = saved[j];
      }
    } catch (e) { /* private mode, blocked storage — defaults are fine */ }
    return out;
  }

  function save() {
    try { window.localStorage.setItem(KEY, JSON.stringify(prefs)); }
    catch (e) { /* nothing we can do, and nothing that should break the page */ }
  }

  function set(key, value) {
    prefs[key] = value;
    save();
    apply();
  }

  /* A single place that turns preferences into DOM state. */
  function apply() {
    root.setAttribute('data-theme', prefs.theme);
    // The original stylesheet keys high contrast off data-contrast; keep it in sync.
    if (prefs.theme === 'high') root.setAttribute('data-contrast', 'high');
    else root.removeAttribute('data-contrast');

    root.style.setProperty('--scale', (prefs.scale / 100).toFixed(2));
    root.style.setProperty('--user-line-height', prefs.lineHeight);
    root.style.setProperty('--user-letter-spacing', prefs.letterSpacing + 'em');

    toggleAttr('data-dyslexia', prefs.dyslexia, 'on');
    toggleAttr('data-underline', prefs.underline, 'on');
    toggleAttr('data-bold-focus', prefs.boldFocus, 'on');
    toggleAttr('data-large-targets', prefs.largeTargets, 'on');
    toggleAttr('data-motion', motionReduced(), 'reduced');
    toggleAttr('data-tts', prefs.tts, 'on');

    ruler.setEnabled(prefs.ruler);
    document.dispatchEvent(new CustomEvent('zera:layout-changed'));
  }

  function toggleAttr(name, on, value) {
    if (on) root.setAttribute(name, value); else root.removeAttribute(name);
  }

  function motionReduced() {
    if (prefs.motion !== null) return prefs.motion;
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* ---------------------------------------------------------------------------
     Announcements — a live region owned by this file, so speech settings can be
     announced even before the shop has booted.
     --------------------------------------------------------------------------- */
  var live = document.createElement('div');
  live.className = 'sr-only';
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('role', 'status');
  document.body.appendChild(live);

  function announce(msg) {
    live.textContent = '';
    window.setTimeout(function () { live.textContent = msg; }, 30);
  }

  /* ---------------------------------------------------------------------------
     Sound cues (earcons)
     Generated with the Web Audio API rather than shipped as files: no network
     request, no decode delay, and the volume is genuinely controllable.
     --------------------------------------------------------------------------- */
  var earcons = (function () {
    var ctx = null;
    var tones = {
      add:     [[660, 0], [880, 0.08]],
      remove:  [[520, 0], [390, 0.08]],
      invalid: [[300, 0], [240, 0.11]],
      step:    [[540, 0]],
      toggle:  [[720, 0]],
      ready:   [[520, 0], [660, 0.07], [784, 0.14]]
    };

    function ensure() {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!ctx) ctx = new AC();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }

    function play(name) {
      if (!prefs.earcons || prefs.earconVolume === 0) return;
      var spec = tones[name];
      if (!spec) return;
      var c = ensure();
      if (!c) return;
      var gainPeak = (prefs.earconVolume / 100) * 0.18;

      spec.forEach(function (pair) {
        var freq = pair[0], at = c.currentTime + pair[1];
        var osc = c.createOscillator();
        var gain = c.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, at);
        // Short attack, exponential release — a click-free blip.
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(gainPeak, at + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
        osc.connect(gain).connect(c.destination);
        osc.start(at);
        osc.stop(at + 0.18);
      });
    }

    return { play: play };
  })();

  /* ---------------------------------------------------------------------------
     Speech engine
     --------------------------------------------------------------------------- */
  var speech = (function () {
    var synth = window.speechSynthesis;
    var supported = !!synth && typeof window.SpeechSynthesisUtterance === 'function';
    var voices = [];
    var current = null;
    var onEndHook = null;

    function refreshVoices() {
      if (!supported) return;
      voices = synth.getVoices() || [];
      document.dispatchEvent(new CustomEvent('zera:voices'));
    }

    if (supported) {
      refreshVoices();
      // Chrome populates the list asynchronously.
      if (typeof synth.addEventListener === 'function') {
        synth.addEventListener('voiceschanged', refreshVoices);
      } else {
        synth.onvoiceschanged = refreshVoices;
      }
    }

    function pickVoice() {
      if (!voices.length) return null;
      if (prefs.ttsVoice) {
        var wanted = voices.filter(function (v) { return v.voiceURI === prefs.ttsVoice; })[0];
        if (wanted) return wanted;
      }
      var lang = (document.documentElement.lang || 'en').slice(0, 2).toLowerCase();
      return voices.filter(function (v) { return (v.lang || '').toLowerCase().indexOf(lang) === 0; })[0] || voices[0];
    }

    function stop() {
      onEndHook = null;
      current = null;
      if (supported) { try { synth.cancel(); } catch (e) {} }
    }

    /* opts: { rate, onend, onboundary } */
    function speak(text, opts) {
      if (!supported || !text) return false;
      opts = opts || {};
      stop();
      var u = new window.SpeechSynthesisUtterance(String(text));
      var v = pickVoice();
      if (v) { u.voice = v; u.lang = v.lang; }
      u.rate = clamp(opts.rate != null ? opts.rate : prefs.ttsRate, 0.5, 2);
      u.pitch = clamp(prefs.ttsPitch, 0.5, 1.6);
      u.volume = 1;
      onEndHook = opts.onend || null;
      u.onend = function () {
        current = null;
        var hook = onEndHook;
        onEndHook = null;
        if (hook) hook();
      };
      u.onerror = function () { current = null; onEndHook = null; };
      if (opts.onboundary) u.onboundary = opts.onboundary;
      current = u;
      // Safari occasionally leaves the queue paused after a cancel().
      try { synth.resume(); } catch (e) {}
      synth.speak(u);
      return true;
    }

    return {
      get supported() { return supported; },
      get voices() { return voices; },
      get speaking() { return supported && (synth.speaking || synth.pending); },
      speak: speak,
      stop: stop,
      pause: function () { if (supported) try { synth.pause(); } catch (e) {} },
      resume: function () { if (supported) try { synth.resume(); } catch (e) {} }
    };
  })();

  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, Number(n) || lo)); }

  /* ---------------------------------------------------------------------------
     Read-aloud mode
     Speaks whatever the pointer rests on or the keyboard focuses. Debounced so a
     sweep across the page does not queue a dozen utterances.
     --------------------------------------------------------------------------- */
  var readAloud = (function () {
    var timer = null;
    var lastEl = null;
    var SKIP = 'script,style,svg,path,head,html,body,main,section,nav,ul,ol,dl,form,fieldset';

    /* Prefer an explicit label; otherwise the element's own visible text. */
    function textFor(el) {
      if (!el || el.nodeType !== 1) return '';
      if (el.closest('[aria-hidden="true"]')) return '';

      var labelled = el.getAttribute('aria-labelledby');
      if (labelled) {
        var parts = labelled.split(/\s+/).map(function (id) {
          var t = document.getElementById(id);
          return t ? t.textContent : '';
        }).filter(Boolean);
        if (parts.length) return parts.join(' ');
      }
      if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');

      if (el.matches('img')) return el.getAttribute('alt') || '';
      if (el.matches('input,select,textarea')) {
        var lab = el.labels && el.labels[0];
        var val = el.type === 'checkbox' || el.type === 'radio'
          ? (el.checked ? ', selected' : ', not selected')
          : (el.value ? ', ' + el.value : '');
        return ((lab ? lab.textContent : el.name || '') + val).trim();
      }

      var t = (el.textContent || '').trim().replace(/\s+/g, ' ');
      return t.length > 600 ? t.slice(0, 600) + '…' : t;
    }

    /* Walk up from the event target to the nearest thing worth reading whole. */
    function readable(el) {
      if (!el || el.nodeType !== 1) return null;
      var block = el.closest(
        'button, a[href], [role="switch"], [role="radio"], label, li.product-card, ' +
        'h1, h2, h3, p, li, dd, dt, legend, figcaption, td, th, output, .fit-pill, .match-pill'
      );
      if (!block || block.matches(SKIP)) return null;
      return block;
    }

    function handle(el) {
      if (!prefs.tts) return;
      var block = readable(el);
      if (!block || block === lastEl) return;
      var text = textFor(block);
      if (!text) return;
      lastEl = block;
      window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        if (!prefs.tts) return;
        markSpeaking(block);
        speech.speak(text, { onend: function () { markSpeaking(null); } });
      }, 220);
    }

    var speakingEl = null;
    function markSpeaking(el) {
      if (speakingEl) speakingEl.classList.remove('is-speaking');
      speakingEl = el;
      if (el) el.classList.add('is-speaking');
    }

    document.addEventListener('mouseover', function (e) { handle(e.target); });
    document.addEventListener('focusin', function (e) { handle(e.target); });
    document.addEventListener('mouseout', function () { lastEl = null; });

    /* Explicit "Listen" buttons and the shop's own speak events. */
    document.addEventListener('zera:speak', function (e) {
      var text = e.detail && e.detail.text;
      if (!text) return;
      if (!speech.supported) { announce('Speech is not available in this browser.'); return; }
      markSpeaking(null);
      speech.speak(text, { onend: function () { markSpeaking(null); } });
    });
    document.addEventListener('zera:speak-stop', function () { markSpeaking(null); speech.stop(); });

    return {
      stop: function () { window.clearTimeout(timer); lastEl = null; markSpeaking(null); speech.stop(); },
      reset: function () { lastEl = null; }
    };
  })();

  /* ---------------------------------------------------------------------------
     Reading ruler
     --------------------------------------------------------------------------- */
  var ruler = (function () {
    var el = document.getElementById('reading-ruler');
    var on = false;

    function move(e) {
      var y = (e.touches ? e.touches[0].clientY : e.clientY);
      el.style.setProperty('--ruler-y', y + 'px');
    }

    function setEnabled(next) {
      if (next === on || !el) return;
      on = next;
      el.hidden = !on;
      if (on) {
        document.addEventListener('mousemove', move, { passive: true });
        document.addEventListener('touchmove', move, { passive: true });
      } else {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('touchmove', move);
      }
    }

    return { setEnabled: setEnabled };
  })();

  /* ---------------------------------------------------------------------------
     Dialogs — one open/close implementation with a focus trap, shared by the
     accessibility panel, the audio guide and the shortcuts list.
     --------------------------------------------------------------------------- */
  function makeDialog(dialogId, overlayId, closeId, opts) {
    opts = opts || {};
    var dialog = document.getElementById(dialogId);
    var overlay = document.getElementById(overlayId);
    var closeBtn = document.getElementById(closeId);
    var returnTo = null;

    function focusables() {
      return Array.prototype.filter.call(
        dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
        function (el) { return !el.disabled && el.offsetParent !== null; }
      );
    }

    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab') return;
      var list = focusables();
      if (!list.length) return;
      var first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    function open(trigger) {
      returnTo = trigger || document.activeElement;
      overlay.classList.add('open');
      dialog.hidden = false;
      root.setAttribute('data-dialog-open', 'true');
      (closeBtn || focusables()[0] || dialog).focus();
      document.addEventListener('keydown', onKey, true);
      if (opts.onOpen) opts.onOpen();
    }

    function close() {
      overlay.classList.remove('open');
      dialog.hidden = true;
      root.removeAttribute('data-dialog-open');
      document.removeEventListener('keydown', onKey, true);
      if (opts.onClose) opts.onClose();
      if (returnTo && document.contains(returnTo)) returnTo.focus();
    }

    if (closeBtn) closeBtn.addEventListener('click', close);
    if (overlay) overlay.addEventListener('click', close);

    return { open: open, close: close, isOpen: function () { return !dialog.hidden; } };
  }

  /* ---------------------------------------------------------------------------
     Audio guide
     A chaptered spoken walkthrough. There is no audio file: the chapters are
     spoken by the device voice, which means they always match the transcript,
     respect the user's chosen voice and rate, and cost nothing to ship.
     The transcript below is the authoritative text either way.
     --------------------------------------------------------------------------- */
  var guide = (function () {
    var chapters = [
      {
        title: 'Welcome',
        text: 'Welcome to Inclusively Zera, a secondhand and deadstock shop by House of Zera. ' +
              'Every piece here was sourced, mended, or restyled by hand. This guide is five short chapters. ' +
              'You can pause at any time, jump between chapters, or read the transcript below instead.'
      },
      {
        title: 'Finding your matches',
        text: 'The shop opens with five questions: the style you want, the kinds of clothing you are looking for, ' +
              'who you are shopping for, the materials you prefer, and the embellishments you are comfortable with. ' +
              'Each question is a single screen. You can skip the quiz entirely and browse everything with the button at the bottom.'
      },
      {
        title: 'How a piece is described',
        text: 'Every piece lists its price and sizes, and then two things most shops leave out. ' +
              'First, dressing details: whether it pulls on, whether it can be fastened one-handed, whether it is cut for seated wear, ' +
              'and whether it has sewn-in tags. Second, where it came from, and which European Union rule put it back into circulation. ' +
              'Open Details on any piece to read its full product passport.'
      },
      {
        title: 'Where the clothes come from',
        text: 'Since July 2026, large companies in the European Union have been barred from destroying unsold clothing and footwear. ' +
              'Separately, every member state is standing up an Extended Producer Responsibility scheme, which funds the sorting of textile waste. ' +
              'Together those rules pushed a great deal of wearable clothing out of incinerators and into reuse channels. ' +
              'This shop routes its stock through those channels, and names the channel on every piece.'
      },
      {
        title: 'Making it yours',
        text: 'The accessibility settings panel holds everything: text size, line and letter spacing, a dyslexia-friendly font, ' +
              'light, dark and high contrast themes, a reading ruler, larger touch targets, sound cues, voice control, and this read-aloud voice. ' +
              'Press the letter A at any time to open it, or press question mark for the full list of keyboard shortcuts. ' +
              'Everything you choose is saved to this browser and nothing is sent anywhere. Thank you for listening.'
      }
    ];

    var index = 0;
    var playing = false;

    var elLabel = document.getElementById('audio-chapter-label');
    var elFill = document.getElementById('audio-progress-fill');
    var elList = document.getElementById('audio-transcript');
    var elPlay = document.getElementById('audio-play');
    var elPlayText = document.getElementById('audio-play-text');
    var elIconPlay = document.getElementById('audio-icon-play');
    var elIconPause = document.getElementById('audio-icon-pause');
    var elRate = document.getElementById('audio-rate');
    var elRateOut = document.getElementById('audio-rate-out');
    var elUnsupported = document.getElementById('audio-unsupported');

    function renderTranscript() {
      elList.innerHTML = '';
      chapters.forEach(function (c, i) {
        var li = document.createElement('li');
        li.className = 'audio-chapter';
        li.id = 'audio-ch-' + i;
        li.innerHTML = '<button type="button" class="audio-chapter-btn" data-chapter="' + i + '">' +
          '<span class="audio-chapter-title">' + c.title + '</span>' +
          '<span class="audio-chapter-text">' + c.text + '</span></button>';
        elList.appendChild(li);
      });
      elList.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-chapter]');
        if (!btn) return;
        go(Number(btn.getAttribute('data-chapter')), true);
      });
    }

    function paint() {
      elLabel.textContent = 'Chapter ' + (index + 1) + ' of ' + chapters.length + ' · ' + chapters[index].title;
      elFill.style.width = Math.round(((index + (playing ? 0.5 : 0)) / chapters.length) * 100) + '%';
      elPlayText.textContent = playing ? 'Pause' : 'Play';
      elPlay.setAttribute('aria-label', playing ? 'Pause the audio guide' : 'Play the audio guide');
      elIconPlay.hidden = playing;
      elIconPause.hidden = !playing;
      Array.prototype.forEach.call(elList.children, function (li, i) {
        li.classList.toggle('is-current', i === index);
      });
    }

    function playFrom(i) {
      index = Math.max(0, Math.min(chapters.length - 1, i));
      playing = true;
      paint();
      var li = document.getElementById('audio-ch-' + index);
      if (li) li.scrollIntoView({ block: 'nearest', behavior: motionReduced() ? 'auto' : 'smooth' });
      var ok = speech.speak(chapters[index].text, {
        rate: Number(elRate.value),
        onend: function () {
          if (!playing) return;
          if (index < chapters.length - 1) playFrom(index + 1);
          else { playing = false; paint(); announce('Audio guide finished.'); }
        }
      });
      if (!ok) { playing = false; paint(); }
    }

    function toggle() {
      if (!speech.supported) { announce('Speech is not available in this browser. The transcript is below.'); return; }
      if (playing) { playing = false; speech.stop(); paint(); announce('Audio guide paused.'); }
      else playFrom(index);
    }

    function go(i, autoplay) {
      var wasPlaying = playing || autoplay;
      playing = false;
      speech.stop();
      index = Math.max(0, Math.min(chapters.length - 1, i));
      if (wasPlaying) playFrom(index); else paint();
    }

    function stop() {
      playing = false;
      speech.stop();
      index = 0;
      paint();
    }

    renderTranscript();
    paint();
    if (!speech.supported) elUnsupported.hidden = false;

    elPlay.addEventListener('click', toggle);
    document.getElementById('audio-prev').addEventListener('click', function () { go(index - 1); });
    document.getElementById('audio-next').addEventListener('click', function () { go(index + 1); });
    document.getElementById('audio-stop').addEventListener('click', function () { stop(); announce('Audio guide stopped.'); });
    elRate.addEventListener('input', function () {
      elRateOut.textContent = Number(elRate.value).toFixed(1) + '×';
      if (playing) playFrom(index); // restart the chapter at the new rate
    });

    return { stop: stop, chapters: chapters };
  })();

  /* ---------------------------------------------------------------------------
     Voice control
     Progressive enhancement only: Chromium and Safari expose SpeechRecognition,
     Firefox does not. Recognition runs on the device; nothing is uploaded by us.
     --------------------------------------------------------------------------- */
  var voice = (function () {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var supported = !!SR;
    var rec = null;
    var on = false;
    var hud = document.getElementById('voice-hud');

    function show(msg, sticky) {
      if (!hud) return;
      hud.hidden = false;
      hud.textContent = msg;
      if (!sticky) window.setTimeout(function () { if (!on) hud.hidden = true; }, 2600);
    }

    /* Matches a spoken phrase against the visible, clickable labels on the page. */
    function act(phrase) {
      var said = phrase.toLowerCase().trim().replace(/[.?!,]/g, '');
      show('Heard: “' + said + '”');

      var commands = [
        [/^(next|continue|go on)$/, function () { click('#quiz-next'); }],
        [/^(back|previous|go back)$/, function () { click('#quiz-back'); }],
        [/^(open |show )?(my )?(bag|cart)$/, function () { click('#cart-open-btn'); }],
        [/^(close|dismiss|cancel)$/, function () { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); }],
        [/^(read|listen|speak)$/, function () { setTTS(!prefs.tts); }],
        [/^(stop|quiet|silence)$/, function () { readAloud.stop(); guide.stop(); }],
        [/^(skip|browse|browse everything)$/, function () { click('#quiz-skip-btn'); }],
        [/^(settings|accessibility|options)$/, function () { panel.open(); }],
        [/^(help|shortcuts)$/, function () { shortcuts.open(); }],
        [/^(bigger|larger|zoom in)$/, function () { setScale(prefs.scale + 10); }],
        [/^(smaller|zoom out)$/, function () { setScale(prefs.scale - 10); }],
        [/^(dark|dark mode)$/, function () { setTheme('dark'); }],
        [/^(light|light mode)$/, function () { setTheme('light'); }],
        [/^(contrast|high contrast)$/, function () { setTheme('high'); }]
      ];

      for (var i = 0; i < commands.length; i++) {
        if (commands[i][0].test(said)) { commands[i][1](); earcons.play('toggle'); return; }
      }

      // Otherwise: try to select a quiz option or press a button by its label.
      var labels = document.querySelectorAll(
        '#quiz-form .quiz-option, .check-row, .btn-add, .btn-ghost, #quiz-form button, .quiz-skip button'
      );
      for (var j = 0; j < labels.length; j++) {
        var el = labels[j];
        if (el.offsetParent === null) continue;
        var text = (el.textContent || '').toLowerCase().replace(/\s+/g, ' ').trim();
        if (text && (text === said || text.indexOf(said) === 0)) {
          var input = el.querySelector('input');
          if (input) { input.checked = !input.checked; input.dispatchEvent(new Event('change', { bubbles: true })); }
          else el.click();
          earcons.play('toggle');
          announce('Selected ' + text);
          return;
        }
      }
      show('No match for “' + said + '”');
      earcons.play('invalid');
    }

    function click(sel) {
      var el = document.querySelector(sel);
      if (el && !el.disabled) el.click();
    }

    function start() {
      if (!supported) { announce('Voice control is not available in this browser.'); return false; }
      rec = new SR();
      rec.continuous = true;
      rec.interimResults = false;
      rec.lang = document.documentElement.lang || 'en-US';
      rec.onresult = function (e) {
        for (var i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) act(e.results[i][0].transcript);
        }
      };
      rec.onerror = function (e) {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          show('Microphone permission was declined.', false);
          setVoice(false);
        }
      };
      rec.onend = function () { if (on) { try { rec.start(); } catch (err) {} } };
      try { rec.start(); } catch (err) { return false; }
      on = true;
      show('Listening. Say “help” for commands.', true);
      return true;
    }

    function stop() {
      on = false;
      if (rec) { try { rec.stop(); } catch (e) {} rec = null; }
      if (hud) hud.hidden = true;
    }

    return {
      get supported() { return supported; },
      start: start,
      stop: stop
    };
  })();

  /* ---------------------------------------------------------------------------
     Wiring: controls
     --------------------------------------------------------------------------- */
  var panel = makeDialog('a11y-panel', 'a11y-overlay', 'a11y-close');
  var audio = makeDialog('audio-guide', 'audio-overlay', 'audio-close', {
    onClose: function () { guide.stop(); }
  });
  var shortcuts = makeDialog('shortcuts-dialog', 'shortcuts-overlay', 'shortcuts-close');

  document.getElementById('a11y-open').addEventListener('click', function (e) { panel.open(e.currentTarget); });
  document.getElementById('audio-guide-open').addEventListener('click', function (e) { audio.open(e.currentTarget); });
  document.getElementById('shortcuts-open').addEventListener('click', function (e) { shortcuts.open(e.currentTarget); });

  /* --- switches --- */
  function bindSwitch(id, key, onChange) {
    var el = document.getElementById(id);
    if (!el) return null;
    function paint() {
      var on = !!prefs[key];
      el.setAttribute('aria-checked', String(on));
      var t = el.querySelector('.switch-text');
      if (t) t.textContent = on ? 'On' : 'Off';
      else el.textContent = on ? 'On' : 'Off';
    }
    el.addEventListener('click', function () {
      var next = !prefs[key];
      if (onChange && onChange(next) === false) { paint(); return; }
      set(key, next);
      paint();
      earcons.play('toggle');
      var label = (el.getAttribute('aria-labelledby')
        ? (document.getElementById(el.getAttribute('aria-labelledby')) || {}).textContent
        : el.getAttribute('aria-label')) || key;
      announce(String(label).trim() + ' ' + (next ? 'on' : 'off') + '.');
    });
    paint();
    return { paint: paint };
  }

  var swDyslexia = bindSwitch('dyslexia-toggle', 'dyslexia');
  var swUnderline = bindSwitch('underline-toggle', 'underline');
  var swFocus = bindSwitch('focus-toggle', 'boldFocus');
  var swRuler = bindSwitch('ruler-toggle', 'ruler');
  var swTargets = bindSwitch('targets-toggle', 'largeTargets');
  var swEarcons = bindSwitch('earcon-toggle', 'earcons');

  var swMotion = (function () {
    var el = document.getElementById('motion-toggle');
    function paint() {
      var on = motionReduced();
      el.setAttribute('aria-checked', String(on));
      el.querySelector('.switch-text').textContent = on ? 'On' : 'Off';
    }
    el.addEventListener('click', function () {
      set('motion', !motionReduced());
      paint();
      earcons.play('toggle');
      announce('Reduce motion ' + (motionReduced() ? 'on' : 'off') + '.');
    });
    paint();
    return { paint: paint };
  })();

  /* --- read aloud (two controls, one state) --- */
  var ttsBar = document.getElementById('tts-toggle');
  var ttsPanel = document.getElementById('tts-toggle-panel');

  function paintTTS() {
    var on = !!prefs.tts;
    ttsBar.setAttribute('aria-pressed', String(on));
    ttsBar.textContent = on ? 'On' : 'Off';
    ttsPanel.setAttribute('aria-checked', String(on));
    ttsPanel.querySelector('.switch-text').textContent = on ? 'On' : 'Off';
  }

  function setTTS(on) {
    if (on && !speech.supported) {
      announce('This browser does not offer a speech voice. Try Chrome, Edge or Safari.');
      return;
    }
    set('tts', on);
    paintTTS();
    readAloud.reset();
    if (on) {
      earcons.play('toggle');
      // The first utterance must follow a gesture, so introduce the mode now.
      speech.speak('Read aloud is on. Point at anything, or press Tab, and I will read it.');
    } else {
      readAloud.stop();
    }
    announce('Read aloud ' + (on ? 'on' : 'off') + '.');
  }

  ttsBar.addEventListener('click', function () { setTTS(!prefs.tts); });
  ttsPanel.addEventListener('click', function () { setTTS(!prefs.tts); });
  paintTTS();

  /* --- voice control --- */
  var voiceBtn = document.getElementById('voice-toggle');
  function paintVoice() {
    var on = !!prefs.voiceControl;
    voiceBtn.setAttribute('aria-checked', String(on));
    voiceBtn.querySelector('.switch-text').textContent = on ? 'On' : 'Off';
  }
  function setVoice(on) {
    if (on && !voice.supported) {
      announce('Voice control is not available in this browser. Chrome, Edge and Safari support it.');
      return;
    }
    if (on) { if (!voice.start()) return; } else voice.stop();
    set('voiceControl', on);
    paintVoice();
    announce('Voice control ' + (on ? 'on. Say help for the command list.' : 'off.'));
  }
  voiceBtn.addEventListener('click', function () { setVoice(!prefs.voiceControl); });
  if (!voice.supported) {
    voiceBtn.disabled = true;
    voiceBtn.closest('.a11y-field').classList.add('is-unavailable');
    voiceBtn.closest('.a11y-field').querySelector('.a11y-field-hint').textContent =
      'Not available in this browser. Chrome, Edge and Safari support voice control.';
  }
  paintVoice();

  /* --- voice picker --- */
  var voiceSelect = document.getElementById('tts-voice');
  function fillVoices() {
    if (!speech.supported) {
      voiceSelect.innerHTML = '<option>No voices available in this browser</option>';
      voiceSelect.disabled = true;
      document.getElementById('voice-field').classList.add('is-unavailable');
      return;
    }
    var list = speech.voices;
    if (!list.length) { voiceSelect.innerHTML = '<option value="">Loading voices…</option>'; return; }
    voiceSelect.innerHTML = '<option value="">Default for this device</option>';
    list.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v.voiceURI;
      o.textContent = v.name + ' (' + v.lang + ')';
      if (v.voiceURI === prefs.ttsVoice) o.selected = true;
      voiceSelect.appendChild(o);
    });
  }
  document.addEventListener('zera:voices', fillVoices);
  fillVoices();
  voiceSelect.addEventListener('change', function () { set('ttsVoice', voiceSelect.value); });

  document.getElementById('tts-test').addEventListener('click', function () {
    if (!speech.supported) { announce('This browser does not offer a speech voice.'); return; }
    speech.speak('This is the voice that will read the shop to you, at the rate and pitch you have chosen.');
  });

  /* --- ranges --- */
  function bindRange(id, outId, key, format, onSet) {
    var el = document.getElementById(id);
    var out = document.getElementById(outId);
    if (!el) return null;
    el.value = prefs[key];
    function paint() { el.value = prefs[key]; out.textContent = format(prefs[key]); }
    el.addEventListener('input', function () {
      var v = Number(el.value);
      prefs[key] = v;
      out.textContent = format(v);
      apply();
      if (onSet) onSet(v);
    });
    el.addEventListener('change', function () { save(); });
    paint();
    return { paint: paint };
  }

  var rScale = bindRange('scale-range', 'scale-out', 'scale', function (v) { return v + '%'; });
  var rLine = bindRange('lh-range', 'lh-out', 'lineHeight', function (v) { return Number(v).toFixed(1); });
  var rLetter = bindRange('ls-range', 'ls-out', 'letterSpacing', function (v) { return Number(v).toFixed(2) + 'em'; });
  var rRate = bindRange('tts-rate', 'tts-rate-out', 'ttsRate', function (v) { return Number(v).toFixed(1) + '×'; });
  var rPitch = bindRange('tts-pitch', 'tts-pitch-out', 'ttsPitch', function (v) { return Number(v).toFixed(1); });
  var rVol = bindRange('earcon-vol', 'earcon-vol-out', 'earconVolume', function (v) { return v + '%'; }, function () { earcons.play('toggle'); });

  function setScale(next) {
    set('scale', clamp(Math.round(next / 10) * 10, 90, 200));
    if (rScale) rScale.paint();
    announce('Text size ' + prefs.scale + ' percent.');
  }

  document.querySelectorAll('[data-textsize]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var action = btn.getAttribute('data-textsize');
      if (action === 'up') setScale(prefs.scale + 10);
      else if (action === 'down') setScale(prefs.scale - 10);
      else setScale(100);
      earcons.play('toggle');
    });
  });

  /* --- theme --- */
  var themeBtns = document.querySelectorAll('[data-theme]');
  var contrastBtn = document.getElementById('contrast-toggle');

  function paintTheme() {
    themeBtns.forEach(function (b) {
      b.setAttribute('aria-checked', String(b.getAttribute('data-theme') === prefs.theme));
    });
    contrastBtn.setAttribute('aria-pressed', String(prefs.theme === 'high'));
    contrastBtn.textContent = prefs.theme === 'high' ? 'On' : 'Off';
  }

  function setTheme(next) {
    set('theme', next);
    paintTheme();
    earcons.play('toggle');
    announce('Theme set to ' + (next === 'high' ? 'high contrast' : next) + '.');
  }

  themeBtns.forEach(function (b) {
    b.addEventListener('click', function () { setTheme(b.getAttribute('data-theme')); });
    b.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      var list = Array.prototype.slice.call(themeBtns);
      var i = list.indexOf(b);
      var next = list[(i + (e.key === 'ArrowRight' ? 1 : list.length - 1)) % list.length];
      next.focus();
      setTheme(next.getAttribute('data-theme'));
    });
  });
  contrastBtn.addEventListener('click', function () { setTheme(prefs.theme === 'high' ? 'light' : 'high'); });
  paintTheme();

  /* --- reset --- */
  document.getElementById('a11y-reset').addEventListener('click', function () {
    voice.stop();
    readAloud.stop();
    guide.stop();
    for (var k in defaults) prefs[k] = defaults[k];
    save();
    apply();
    [swDyslexia, swUnderline, swFocus, swRuler, swTargets, swEarcons, swMotion,
     rScale, rLine, rLetter, rRate, rPitch, rVol].forEach(function (c) { if (c) c.paint(); });
    paintTTS(); paintVoice(); paintTheme(); fillVoices();
    announce('All accessibility settings reset to their defaults.');
  });

  /* ---------------------------------------------------------------------------
     Sound cues driven by what the shop reports
     --------------------------------------------------------------------------- */
  document.addEventListener('zera:cart-add', function () { earcons.play('add'); });
  document.addEventListener('zera:invalid', function () { earcons.play('invalid'); });
  document.addEventListener('zera:step', function () { earcons.play('step'); });
  document.addEventListener('zera:ready', function () { readAloud.reset(); });

  /* ---------------------------------------------------------------------------
     Keyboard shortcuts
     --------------------------------------------------------------------------- */
  function typing(el) {
    return !!el && (el.isContentEditable ||
      /^(input|textarea|select)$/i.test(el.tagName));
  }

  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.key === 'Escape') {
      readAloud.stop();
      guide.stop();
      return; // individual dialogs handle their own close
    }
    if (typing(e.target)) return;

    switch (e.key) {
      case '?': shortcuts.open(); e.preventDefault(); break;
      case 'a': case 'A': panel.open(); e.preventDefault(); break;
      case 'g': case 'G': audio.open(); e.preventDefault(); break;
      case 'r': case 'R': setTTS(!prefs.tts); e.preventDefault(); break;
      case 's': case 'S': readAloud.stop(); guide.stop(); announce('Stopped speaking.'); e.preventDefault(); break;
      case 'b': case 'B': {
        var bag = document.getElementById('cart-open-btn');
        if (bag) { bag.click(); e.preventDefault(); }
        break;
      }
      case 'c': case 'C': {
        var order = ['light', 'dark', 'high'];
        setTheme(order[(order.indexOf(prefs.theme) + 1) % order.length]);
        e.preventDefault();
        break;
      }
      case '+': case '=': setScale(prefs.scale + 10); e.preventDefault(); break;
      case '-': case '_': setScale(prefs.scale - 10); e.preventDefault(); break;
      case '0': setScale(100); e.preventDefault(); break;
    }
  });

  /* ---------------------------------------------------------------------------
     Start
     --------------------------------------------------------------------------- */
  apply();

  // Read-aloud and voice control both need a gesture, so they never auto-resume;
  // the stored value is kept but the feature starts off until the user says so.
  if (prefs.tts) { prefs.tts = false; paintTTS(); apply(); }
  if (prefs.voiceControl) { prefs.voiceControl = false; paintVoice(); }

  // Keep in step with a system preference change while the page is open.
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    var onMQ = function () { if (prefs.motion === null) { apply(); swMotion.paint(); } };
    if (mq.addEventListener) mq.addEventListener('change', onMQ);
    else if (mq.addListener) mq.addListener(onMQ);
  }

  window.ZERA_A11Y = {
    prefs: function () { return JSON.parse(JSON.stringify(prefs)); },
    speak: function (t) { return speech.speak(t); },
    stop: function () { readAloud.stop(); guide.stop(); },
    setTheme: setTheme,
    setScale: setScale,
    speechSupported: speech.supported,
    voiceSupported: voice.supported
  };
})();
