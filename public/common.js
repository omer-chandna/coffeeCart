/* Shared helpers: API calls, the cup illustrations, chimes and toasts. */
(function () {
  "use strict";

  var uid = 0;

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function api(method, url, body, headers) {
    var opts = { method: method, headers: Object.assign({ "Content-Type": "application/json" }, headers || {}) };
    if (body !== undefined) opts.body = JSON.stringify(body);
    return fetch(url, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error(data.error || "Something went wrong");
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  /* A top-down cup being stirred, drawn in line: saucer, cup, a dark coffee disc, a crema swirl, a circling spoon. */
  function stirCup(opts) {
    opts = opts || {};
    var n = ++uid;
    var idle = opts.idle ? " idle" : "";
    var cut = opts.swirl || "#3a2418";
    var art = opts.art
      ? '<path d="M100 86c-8-11-24-5-21 6 3 9 14 15 21 23 7-8 18-14 21-23 3-11-13-17-21-6z" fill="' + cut + '"/>'
      : "";
    return (
      '<svg class="stir' + idle + '" viewBox="0 0 200 200" aria-hidden="true" focusable="false">' +
      '<defs><clipPath id="cl' + n + '"><circle cx="100" cy="100" r="54"/></clipPath></defs>' +
      '<g fill="none" stroke="currentColor" stroke-width="1.2">' +
      '<circle cx="100" cy="100" r="94"/><circle cx="100" cy="100" r="82" stroke-dasharray="2 5"/>' +
      '<circle cx="100" cy="100" r="66"/>' +
      '<path d="M166 92h18a8 8 0 0 1 0 16h-18"/>' +
      "</g>" +
      '<circle cx="100" cy="100" r="54" fill="currentColor"/>' +
      '<g clip-path="url(#cl' + n + ')">' +
      '<g class="swirl" fill="none" stroke="' + cut + '" stroke-linecap="round">' +
      '<path d="M100 100c0-9 13-11 17-2 5 13-11 24-24 18-19-7-15-33 4-39 24-7 43 15 35 37-7 24-41 32-59 15" stroke-width="2.4" opacity=".9"/>' +
      '<path d="M72 80c13-20 46-18 55 6" stroke-width="1.2" opacity=".6"/>' +
      "</g>" + art +
      '<circle class="ring" cx="100" cy="100" r="50" fill="none" stroke="' + cut + '" stroke-width=".8"/>' +
      "</g>" +
      '<g class="spoon" fill="none" stroke="currentColor" stroke-linecap="round">' +
      '<ellipse cx="124" cy="100" rx="11" ry="7.5" fill="' + cut + '" stroke-width="1.4"/>' +
      '<path d="M135 99.5 L198 93" stroke-width="2.2"/>' +
      "</g>" +
      "</svg>"
    );
  }

  /* A small side-on cup with steam, in line. */
  function steamCup() {
    return (
      '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" style="overflow:visible">' +
      '<g class="steam" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">' +
      '<path d="M24 20c-3-4 3-6 0-10"/><path d="M32 20c-3-4 3-6 0-10"/><path d="M40 20c-3-4 3-6 0-10"/></g>' +
      '<g fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 26h36v10a16 16 0 0 1-16 16h-4A16 16 0 0 1 14 36z"/>' +
      '<path d="M50 30h3a6 6 0 0 1 0 12h-4"/><path d="M8 56h48"/></g></svg>'
    );
  }

  var SUGAR = ["No sugar", "A touch", "One spoon", "Sweet", "Extra sweet"];

  function sugarCubes(level) {
    var out = "";
    for (var i = 0; i < 4; i++) {
      out += '<span class="cube-dot' + (i < level ? " on" : "") + '"></span>';
    }
    return '<span class="cubes" title="' + SUGAR[level] + '">' + out + "</span>";
  }

  /* Chimes made with Web Audio, no sound files needed. */
  var audioCtx = null;
  function unlockAudio() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
    } catch (e) { /* no audio, that's fine */ }
  }
  function chime(kind) {
    if (!audioCtx) return;
    var notes = kind === "new" ? [659.25, 880] : [523.25, 659.25, 783.99, 1046.5];
    var t = audioCtx.currentTime;
    notes.forEach(function (freq, i) {
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      var start = t + i * 0.16;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.28, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(start);
      osc.stop(start + 1);
    });
  }

  var toastTimer;
  function toast(message) {
    var el = document.getElementById("toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2800);
  }

  function minutesAgo(ms, serverTime) {
    var mins = Math.max(0, Math.round(((serverTime || Date.now()) - ms) / 60000));
    return mins < 1 ? "just now" : mins + " min ago";
  }

  function store(key, value) {
    try {
      if (value === undefined) return JSON.parse(localStorage.getItem(key) || "null");
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { return null; }
  }

  window.Cafe = {
    esc: esc, api: api, stirCup: stirCup, steamCup: steamCup, SUGAR: SUGAR, sugarCubes: sugarCubes,
    unlockAudio: unlockAudio, chime: chime, toast: toast, minutesAgo: minutesAgo, store: store,
  };
})();
