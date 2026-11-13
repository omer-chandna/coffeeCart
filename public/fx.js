/* Page effects: the dot matrix background, scroll reveals, and the word by word tagline.

   The dot matrix fragment shader is adapted from the "Dot Matrix Background" component in
   ThreeUI Community by Meng To (https://github.com/MengTo/threeui), MIT License,
   Copyright (c) 2026 Meng To. Ported from React + three.js to plain WebGL and recoloured. */
(function () {
  "use strict";
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- dot matrix ----------
  function dotMatrix(canvas) {
    var gl = canvas.getContext("webgl", { alpha: true, antialias: false, powerPreference: "low-power" });
    if (!gl) return;
    var vert = "attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }";
    var frag = [
      "precision mediump float;",
      "uniform float uTime; uniform vec2 uResolution; uniform vec2 uMouse;",
      "uniform float uGridScale; uniform float uPulseSpeed; uniform float uRadius; uniform float uOpacity; uniform vec3 uColor;",
      "void main() {",
      "  vec2 uv = gl_FragCoord.xy / uResolution.xy;",
      "  float aspect = uResolution.x / uResolution.y;",
      "  uv.x *= aspect;",
      "  uv += uMouse * 0.04;",
      "  vec2 grid = fract(uv * uGridScale);",
      "  vec2 id = floor(uv * uGridScale);",
      "  float dist = length(grid - vec2(0.5));",
      "  float pulse = sin(uTime * uPulseSpeed + id.x * 0.22 + id.y * 0.22) * 0.5 + 0.5;",
      "  float radius = 0.06 + pulse * uRadius;",
      "  float alpha = smoothstep(radius, radius - 0.05, dist);",
      "  vec2 center = vec2(0.5 * aspect, 0.62);",
      "  float depthFade = smoothstep(0.75, 0.05, length(uv - center));",
      "  gl_FragColor = vec4(uColor, 1.0) * (alpha * depthFade * uOpacity * (0.35 + 0.65 * pulse));",
      "}",
    ].join("\n");

    function shader(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    }
    var vs = shader(gl.VERTEX_SHADER, vert), fs = shader(gl.FRAGMENT_SHADER, frag);
    if (!vs || !fs) return;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    var u = {};
    ["uTime", "uResolution", "uMouse", "uGridScale", "uPulseSpeed", "uRadius", "uOpacity", "uColor"].forEach(function (n) {
      u[n] = gl.getUniformLocation(prog, n);
    });
    gl.uniform3f(u.uColor, 0.89, 0.71, 0.53); // crema
    gl.uniform1f(u.uPulseSpeed, 0.7);
    gl.uniform1f(u.uRadius, 0.14);
    gl.uniform1f(u.uOpacity, 0.38);

    var mouse = [0, 0], target = [0, 0], frame = 0, visible = true, started = performance.now();

    function resize() {
      var r = canvas.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 1.5); // keep phones cool
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(u.uResolution, canvas.width, canvas.height);
      gl.uniform1f(u.uGridScale, r.width < 600 ? 26 : 44);
      if (!frame) draw(performance.now(), true);
    }

    function draw(now, once) {
      mouse[0] += (target[0] - mouse[0]) * 0.05;
      mouse[1] += (target[1] - mouse[1]) * 0.05;
      gl.uniform1f(u.uTime, (now - started) * 0.001);
      gl.uniform2f(u.uMouse, mouse[0], mouse[1]);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      frame = !once && !reduced && visible && !document.hidden ? requestAnimationFrame(draw) : 0;
    }

    function wake() { if (!frame && visible && !document.hidden && !reduced) frame = requestAnimationFrame(draw); }

    window.addEventListener("pointermove", function (e) {
      target[0] = (e.clientX / window.innerWidth) * 2 - 1;
      target[1] = -((e.clientY / window.innerHeight) * 2 - 1);
    }, { passive: true });
    if ("ResizeObserver" in window) new ResizeObserver(resize).observe(canvas);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) wake(); else if (frame) { cancelAnimationFrame(frame); frame = 0; }
      }).observe(canvas);
    }
    document.addEventListener("visibilitychange", wake);
    resize();
    wake();
  }

  var canvas = document.getElementById("dots");
  if (canvas) { try { dotMatrix(canvas); } catch (e) { /* no WebGL: the flat brown ground stays */ } }

  // ---------- scroll reveals (once each) ----------
  var reveals = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    reveals.forEach(function (el) { el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -10% 0px" });
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
        var r = tag.getBoundingClientRect();
        var vh = window.innerHeight;
        // progress runs 0 → 1 while the block travels from 85% to 35% of the screen
        var prog = (vh * 0.85 - r.top) / (vh * 0.5 + r.height * 0.5);
        var lit = Math.round(Math.max(0, Math.min(1, prog)) * spans.length);
        spans.forEach(function (s, i) { s.classList.toggle("on", i < lit); });
      };
      new IntersectionObserver(function (entries) { near = entries[0].isIntersecting; if (near) update(); }, { rootMargin: "20% 0px" }).observe(tag);
      window.addEventListener("scroll", function () {
        if (near && !ticking) { ticking = true; requestAnimationFrame(update); }
      }, { passive: true });
      update();
    }
  }
})();
