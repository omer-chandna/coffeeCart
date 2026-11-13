/* Page effects: the live ASCII cup figure, scroll reveals, and the word by word tagline. */
(function () {
  "use strict";
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var RAMP = " ..::-=+*#%";

  /* A cup seen from above, drawn in characters: a swirl turning inside the rim, a saucer ring,
     a slow field around it, and one orange square where the spoon is. */
  function ascii(canvas, opts) {
    opts = opts || {};
    var ctx = canvas.getContext("2d");
    if (!ctx) return { set: function () {} };
    var state = { speed: opts.speed == null ? 1 : opts.speed, marker: opts.marker !== false };
    var ink = opts.ink || "#f3cfa6", accent = opts.accent || "#f08a45";
    var cw = 11, ch = 15, w = 0, h = 0, dpr = 1, cols = 0, rows = 0;
    var t = 0, last = 0, frame = 0, visible = true;

    function resize() {
      var r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      cols = Math.ceil(w / cw); rows = Math.ceil(h / ch);
      draw();
    }

    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.font = '500 11px "Geist Mono", ui-monospace, Menlo, monospace';
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillStyle = ink;
      var cx = w / 2, cy = h / 2, S = Math.min(w, h) * 0.5, R = 0.66;
      var ma = -t * 0.7, mx = cx + Math.cos(ma) * R * 0.55 * S, my = cy + Math.sin(ma) * R * 0.55 * S;
      var mcol = Math.round((mx - cw / 2) / cw), mrow = Math.round((my - ch / 2) / ch);
      for (var j = 0; j < rows; j++) {
        for (var i = 0; i < cols; i++) {
          var px = i * cw + cw / 2, py = j * ch + ch / 2;
          var nx = (px - cx) / S, ny = (py - cy) / S;
          var r = Math.sqrt(nx * nx + ny * ny), v;
          if (r < R) {
            var a = Math.atan2(ny, nx);
            var swirl = Math.sin(a * 2 - r * 10 + t * 1.4) * 0.5 + 0.5;
            v = 0.3 + 0.7 * swirl * (0.45 + 0.55 * (r / R));
          } else if (r < R + 0.09) {
            v = 1;
          } else if (r > R + 0.3 && r < R + 0.36) {
            v = 0.34;
          } else {
            v = 0.12 + 0.16 * (Math.sin(nx * 2.4 + t * 0.5) + Math.sin(ny * 3.1 - t * 0.35)) * 0.5 + 0.08;
            v *= Math.max(0, 1.5 - r * 0.5);
          }
          if (state.marker && i === mcol && j === mrow) {
            ctx.fillStyle = accent;
            ctx.fillRect(px - 4.5, py - 4.5, 9, 9);
            ctx.fillStyle = ink;
            continue;
          }
          var c = RAMP[Math.max(0, Math.min(RAMP.length - 1, Math.round(v * (RAMP.length - 1))))];
          if (c !== " ") ctx.fillText(c, px, py);
        }
      }
    }

    function tick(now) {
      frame = 0;
      if (now - last > 80) { // about 12 frames a second is plenty for characters
        t += Math.min(0.2, (now - last) / 1000) * state.speed;
        last = now;
        draw();
      }
      wake();
    }
    function wake() {
      if (!frame && visible && !document.hidden && !reduced && state.speed > 0) frame = requestAnimationFrame(tick);
    }

    if ("ResizeObserver" in window) new ResizeObserver(resize).observe(canvas);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (e) { visible = e[0].isIntersecting; wake(); }).observe(canvas);
    }
    document.addEventListener("visibilitychange", wake);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
    last = performance.now();
    resize();
    wake();
    return { set: function (k, v) { state[k] = v; wake(); draw(); } };
  }

  window.Cafe = window.Cafe || {};
  window.Cafe.ascii = ascii;

  var hero = document.getElementById("fig-hero");
  if (hero) ascii(hero);

  // ---------- scroll reveals (once each) ----------
  var reveals = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    reveals.forEach(function (el) { el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    reveals.forEach(function (el) { io.observe(el); });
  }

  // ---------- tagline: words light up one at a time as they cross a line ----------
  var tag = document.getElementById("tagline");
  if (tag) {
    var words = tag.textContent.trim().split(/\s+/);
    tag.setAttribute("aria-label", words.join(" "));
    tag.innerHTML = words.map(function (w) { return '<span class="w" aria-hidden="true">' + w + "</span>"; }).join(" ");
    var spans = tag.querySelectorAll(".w");
    if (reduced || !("IntersectionObserver" in window)) {
      spans.forEach(function (s) { s.classList.add("on"); });
    } else {
      var ticking = false, near = false;
      var update = function () {
        ticking = false;
        var r = tag.getBoundingClientRect(), vh = window.innerHeight;
        var prog = (vh * 0.85 - r.top) / (vh * 0.5 + r.height * 0.5);
        var lit = Math.round(Math.max(0, Math.min(1, prog)) * spans.length);
        spans.forEach(function (s, i) { s.classList.toggle("on", i < lit); });
      };
      new IntersectionObserver(function (e) { near = e[0].isIntersecting; if (near) update(); }, { rootMargin: "20% 0px" }).observe(tag);
      window.addEventListener("scroll", function () {
        if (near && !ticking) { ticking = true; requestAnimationFrame(update); }
      }, { passive: true });
      update();
    }
  }

  // ---------- footer clock ----------
  var clock = document.getElementById("clock");
  if (clock) {
    var showTime = function () {
      var d = new Date();
      var p = function (n) { return n < 10 ? "0" + n : n; };
      clock.textContent = p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
    };
    showTime();
    setInterval(showTime, 1000);
  }
})();
