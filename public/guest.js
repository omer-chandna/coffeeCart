/* Guest page: order form, live tickets, the public queue, and the ready call. */
(function () {
  "use strict";
  var C = window.Cafe;
  var $ = function (id) { return document.getElementById(id); };

  var data = { menu: [], optionGroups: [], queue: [], settings: { open: true, houseName: "" } };
  var mine = C.store("cc.orders") || [];          // order ids this phone placed
  var seenPings = C.store("cc.seen") || {};       // order id -> pings already announced
  var orders = {};                                 // order id -> latest order data
  var wantsForm = false;
  var formBuilt = false;
  var menuSig = "";
  var titleBase = document.title;
  var titleTimer = null;

  $("hero-cup").innerHTML = C.stirCup();
  if ($("closing-cup")) $("closing-cup").innerHTML = C.steamCup();

  // ---------- polling ----------
  function refresh() {
    var jobs = [C.api("GET", "/api/state").then(function (s) { data = s; })];
    mine.forEach(function (id) {
      jobs.push(
        C.api("GET", "/api/orders/" + id)
          .then(function (o) { orders[id] = o; })
          .catch(function (e) { if (e.status === 404) forget(id); })
      );
    });
    return Promise.all(jobs).then(render, function () { setStatus(null); });
  }

  function loop() {
    refresh().then(function () { setTimeout(loop, document.hidden ? 6000 : 3000); });
  }

  function forget(id) {
    mine = mine.filter(function (x) { return x !== id; });
    delete orders[id];
    C.store("cc.orders", mine);
  }

  function pad(n) { return n < 10 ? "0" + n : String(n); }

  // ---------- rendering ----------
  function render() {
    document.querySelectorAll("[data-house]").forEach(function (el) { el.textContent = data.settings.houseName; });
    titleBase = data.settings.houseName + ": coffee made to order";
    if (!titleTimer) document.title = titleBase;
    setStatus(data.settings.open);
    renderQueue();

    // drop finished tickets an hour after they're done
    mine.slice().forEach(function (id) {
      var o = orders[id];
      if (o && (o.status === "cancelled" || (o.status === "collected" && Date.now() - o.updatedAt > 3600000))) forget(id);
    });

    var tickets = mine.map(function (id) { return orders[id]; }).filter(Boolean);
    if (tickets.length && !wantsForm) {
      renderTickets(tickets);
      formBuilt = false;
    } else {
      renderForm();
    }
    checkReady(tickets);
  }

  function setStatus(open) {
    var pill = $("bar-status");
    if (open === null) {
      pill.className = "status label closed";
      pill.lastElementChild.textContent = "Offline";
      return;
    }
    pill.className = "status label" + (open ? "" : " closed");
    var waiting = data.queue.filter(function (o) { return o.status !== "ready"; }).length;
    pill.lastElementChild.textContent = open ? "Open" : "Closed";
    $("fact-menu").textContent = data.menu.filter(function (d) { return d.available; }).length + " drinks";
    $("fact-queue").textContent = !open ? "Bar closed" : waiting === 0 ? "No wait right now" : waiting + (waiting === 1 ? " cup in line" : " cups in line");
  }

  function renderQueue() {
    var q = data.queue;
    var sig = JSON.stringify([q, mine]);
    if ($("queue").dataset.sig === sig) return;
    $("queue").dataset.sig = sig;
    if (!q.length) {
      $("queue").innerHTML = '<div class="empty"><div class="cup">' + C.stirCup({ idle: true }) + "</div><p>Nobody waiting. The machine is warm.</p></div>";
      return;
    }
    var mineNums = mine.map(function (id) { return orders[id] && orders[id].number; });
    $("queue").innerHTML = '<ol class="queue">' + q.map(function (o) {
      var isMine = mineNums.indexOf(o.number) !== -1;
      return '<li class="q' + (isMine ? " mine" : "") + '">' +
        '<span class="no">' + pad(o.number) + "</span>" +
        '<span class="who">' + C.esc(o.name) + "</span>" +
        '<span class="what label">' + C.esc(o.drinkName) + "</span>" +
        '<span class="st label ' + o.status + '">' + statusWord(o.status) + "</span></li>";
    }).join("") + "</ol>";
  }

  function statusWord(status) {
    return { queued: "In line", making: "Brewing", ready: "Ready", collected: "Picked up", cancelled: "Cancelled" }[status];
  }

  function specLine(o) {
    var bits = Object.keys(o.options || {}).map(function (k) { return o.options[k]; });
    bits.push(C.SUGAR[o.sugar] || "No sugar");
    return bits.join(" / ");
  }

  function renderTickets(tickets) {
    var view = $("order-view");
    // keep the cup animations smooth: only replace the markup when an order changed
    var sig = "t" + JSON.stringify(tickets.map(function (o) { return [o.id, o.status, o.position]; }));
    if (view.dataset.sig === sig) return;
    view.dataset.sig = sig;
    view.innerHTML = tickets.map(ticketHtml).join("") +
      '<div class="row"><button class="btn line" type="button" data-act="another">Order another <span class="arrow" aria-hidden="true">→</span></button></div>';
  }

  function ticketHtml(o) {
    var steps = ["queued", "making", "ready"];
    var at = o.status === "collected" ? 3 : steps.indexOf(o.status);
    var line = {
      queued: o.position === 0 ? "You're next." : o.position + (o.position === 1 ? " order" : " orders") + " ahead of you.",
      making: "Brewing now.",
      ready: "Ready at the bar. Come and get it.",
      collected: "Enjoy every sip.",
      cancelled: "Cancelled.",
    }[o.status];
    var art = o.status === "collected" ? '<div style="padding:18%">' + C.steamCup() + "</div>"
      : C.stirCup({ idle: o.status === "queued", art: o.status === "ready" });
    return '<article class="ticket' + (o.status === "ready" ? " is-ready" : "") + '">' +
      '<div class="step-head label"><span>Ticket</span><span class="mute">' + C.esc(o.name) + "</span></div>" +
      '<div class="ticket-main"><div class="ticket-no"><small>No.</small>' + pad(o.number) + "</div>" +
      '<div class="ticket-art">' + art + "</div></div>" +
      "<h3>" + C.esc(o.name) + "'s <em>" + C.esc(o.drinkName.toLowerCase()) + "</em></h3>" +
      '<p class="spec label">' + C.esc(specLine(o)) + "</p>" +
      (o.notes ? '<p class="spec">“' + C.esc(o.notes) + "”</p>" : "") +
      '<ol class="track label" aria-label="Order progress">' +
      ["In line", "Brewing", "Ready"].map(function (label, i) {
        var cls = i < at || (i === at && o.status === "ready") || at === 3 ? "done" : i === at ? "now" : "";
        return '<li class="' + cls + '">' + label + "</li>";
      }).join("") + "</ol>" +
      '<p class="say" aria-live="polite">' + line + "</p>" +
      (o.status === "queued" ? '<div class="row"><button class="text-btn" type="button" data-act="cancel" data-id="' + o.id + '">Cancel this order</button></div>' : "") +
      "</article>";
  }

  // ---------- the form ----------
  function renderForm() {
    var view = $("order-view");
    var sig = JSON.stringify([data.menu, data.optionGroups, data.settings.open]);
    if (formBuilt && sig === menuSig) return;
    var keep = formBuilt ? readForm() : null;
    menuSig = sig;
    formBuilt = true;
    view.dataset.sig = "";

    var available = data.menu.filter(function (d) { return d.available; });
    var hasTickets = mine.some(function (id) { return orders[id]; });
    var back = hasTickets ? '<div class="row" style="margin-bottom:16px"><button class="text-btn" type="button" data-act="tickets">← Back to my ticket</button></div>' : "";

    if (!data.settings.open) {
      view.innerHTML = back + '<div class="empty"><div class="cup">' + C.stirCup({ idle: true }) + "</div><p>The bar is closed for now. Check back in a bit.</p></div>";
      return;
    }
    if (!available.length) {
      view.innerHTML = back + '<div class="empty"><div class="cup">' + C.stirCup({ idle: true }) + "</div><p>Nothing on the menu yet. The barista is setting up.</p></div>";
      return;
    }

    view.innerHTML = back + '<form id="order-form" novalidate>' +
      '<div class="step"><div class="step-head label"><label for="f-name">01 Name</label><span class="mute">Required</span></div>' +
      '<input class="input" id="f-name" name="name" autocomplete="given-name" maxlength="30" placeholder="Your name">' +
      '<p class="error" id="e-name"></p></div>' +

      '<fieldset class="step"><legend class="sr-only">Pick a drink</legend>' +
      '<div class="step-head label" aria-hidden="true"><span>02 Drink</span><span class="mute">' + available.length + " on</span></div>" +
      '<div class="menu">' + available.map(function (d, i) {
        return '<label class="drink"><input type="radio" name="drink" value="' + C.esc(d.id) + '"' + (i === 0 ? " checked" : "") + ">" +
          '<span class="drink-row"><span class="n">' + pad(i + 1) + '</span><span class="name">' + C.esc(d.name) + "</span>" +
          '<span class="desc">' + C.esc(d.description || "") + "</span></span></label>";
      }).join("") + "</div></fieldset>" +

      '<div class="step" id="opt-step"><div class="step-head label"><span>03 Options</span><span class="mute">Your call</span></div>' +
      '<div class="opt-groups">' + data.optionGroups.map(function (g) {
        return '<fieldset class="opt-group" data-group="' + C.esc(g.id) + '"><legend class="label mute" style="margin-bottom:10px">' + C.esc(g.name) + "</legend>" +
          '<div class="toggles">' + g.choices.map(function (c, i) {
            return '<label class="toggle"><input type="radio" name="opt-' + C.esc(g.id) + '" value="' + C.esc(c) + '"' + (i === 0 ? " checked" : "") + "><span>" + C.esc(c) + "</span></label>";
          }).join("") + "</div></fieldset>";
      }).join("") + "</div></div>" +

      '<fieldset class="step"><legend class="sr-only">Sugar</legend>' +
      '<div class="step-head label" aria-hidden="true"><span>04 Sugar</span><span class="mute">Spoons</span></div>' +
      '<div class="sugar"><div class="sugar-cup" id="sugar-cup">' + sugarCupSvg() + "</div><div>" +
      '<div class="sugar-now" id="sugar-now">No sugar</div>' +
      '<div class="levels">' + C.SUGAR.map(function (label, i) {
        return '<label class="level" title="' + label + '"><input type="radio" name="sugar" value="' + i + '"' + (i === 0 ? " checked" : "") + ' aria-label="' + label + '"><span>' + i + "</span></label>";
      }).join("") + "</div></div></div></fieldset>" +

      '<div class="step"><div class="step-head label"><label for="f-notes">05 Notes</label><span class="mute">Optional</span></div>' +
      '<textarea class="textarea" id="f-notes" name="notes" maxlength="140" placeholder="Extra hot, half caf, a little cinnamon"></textarea></div>' +

      '<p class="error" id="e-form" role="alert"></p>' +
      '<div class="submit"><button class="btn" type="submit" id="f-submit"><span>Send my order</span><span class="arrow" aria-hidden="true">→</span></button></div>' +
      "</form>";

    var form = $("order-form");
    form.name.value = (keep && keep.name) || C.store("cc.name") || "";
    if (keep) applyForm(keep);
    form.addEventListener("change", syncForm);
    form.addEventListener("input", syncForm);
    form.addEventListener("submit", submit);
    syncForm();
  }

  function sugarCupSvg() {
    var cubes = "";
    [[30, 40], [44, 36], [58, 40], [44, 26]].forEach(function (p, i) {
      cubes += '<g class="cube off" data-cube="' + i + '"><rect x="' + (p[0] - 6) + '" y="' + (p[1] - 6) + '" width="12" height="12" fill="#f6ecdf" stroke="#3a2418" stroke-width="1.2" transform="rotate(' + (i * 11 - 12) + " " + p[0] + " " + p[1] + ')"/></g>';
    });
    return '<svg viewBox="0 0 96 96" aria-hidden="true" style="overflow:visible;width:100%;height:100%">' +
      '<g fill="none" stroke="currentColor" stroke-width="1.4">' +
      '<path d="M12 46h64v12a26 26 0 0 1-26 26h-12A26 26 0 0 1 12 58z"/>' +
      '<path d="M76 52h5a9 9 0 0 1 0 18h-6"/><path d="M4 90h80"/></g>' +
      '<ellipse cx="44" cy="47" rx="31" ry="4.5" fill="currentColor" opacity=".9"/>' +
      cubes + "</svg>";
  }

  function readForm() {
    var form = $("order-form");
    if (!form) return null;
    var picked = form.querySelector('input[name="drink"]:checked');
    var sugar = form.querySelector('input[name="sugar"]:checked');
    var opts = {};
    data.optionGroups.forEach(function (g) {
      var el = form.querySelector('input[name="opt-' + CSS.escape(g.id) + '"]:checked');
      if (el) opts[g.id] = el.value;
    });
    return {
      name: form.name.value.trim(),
      drinkId: picked ? picked.value : "",
      options: opts,
      sugar: sugar ? Number(sugar.value) : 0,
      notes: form.notes.value.trim(),
    };
  }

  function applyForm(v) {
    var form = $("order-form");
    var pick = function (sel) { var el = form.querySelector(sel); if (el) el.checked = true; };
    pick('input[name="drink"][value="' + CSS.escape(v.drinkId) + '"]');
    Object.keys(v.options).forEach(function (gid) {
      pick('input[name="opt-' + CSS.escape(gid) + '"][value="' + CSS.escape(v.options[gid]) + '"]');
    });
    pick('input[name="sugar"][value="' + v.sugar + '"]');
    form.notes.value = v.notes;
  }

  function syncForm() {
    var v = readForm();
    if (!v) return;
    var drink = data.menu.filter(function (d) { return d.id === v.drinkId; })[0];
    var groups = (drink && drink.options) || [];
    document.querySelectorAll(".opt-group").forEach(function (fs) {
      fs.hidden = groups.indexOf(fs.dataset.group) === -1;
    });
    $("opt-step").hidden = !groups.length;
    $("sugar-now").textContent = C.SUGAR[v.sugar];
    document.querySelectorAll(".level").forEach(function (el, i) { el.classList.toggle("fill", i > 0 && i < v.sugar); });
    document.querySelectorAll("#sugar-cup .cube").forEach(function (cube) {
      cube.classList.toggle("off", Number(cube.dataset.cube) >= v.sugar);
    });
    if (v.name) $("e-name").textContent = "";
  }

  function submit(ev) {
    ev.preventDefault();
    C.unlockAudio(); // a tap counts as permission to play the ready chime later
    var v = readForm();
    if (!v.name) {
      $("e-name").textContent = "Add your name so we know whose cup it is.";
      $("f-name").focus();
      return;
    }
    var drink = data.menu.filter(function (d) { return d.id === v.drinkId; })[0];
    var opts = {};
    ((drink && drink.options) || []).forEach(function (gid) { if (v.options[gid]) opts[gid] = v.options[gid]; });
    var btn = $("f-submit");
    btn.disabled = true;
    btn.firstChild.textContent = "Sending…";
    $("e-form").textContent = "";
    C.api("POST", "/api/orders", { name: v.name, drinkId: v.drinkId, options: opts, sugar: v.sugar, notes: v.notes })
      .then(function (order) {
        C.store("cc.name", v.name);
        mine.push(order.id);
        C.store("cc.orders", mine);
        orders[order.id] = order;
        wantsForm = false;
        formBuilt = false;
        askNotify();
        C.toast("Order No. " + pad(order.number) + " is in. We'll call you.");
        return refresh();
      })
      .then(function () { $("order").scrollIntoView({ behavior: "smooth", block: "start" }); })
      .catch(function (e) {
        $("e-form").textContent = e.message;
        btn.disabled = false;
        btn.firstChild.textContent = "Send my order";
      });
  }

  // ---------- the ready call ----------
  function askNotify() {
    // System notifications only work over HTTPS or on localhost; elsewhere the in-page call does the job.
    if ("Notification" in window && window.isSecureContext && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }

  var showing = null;
  function checkReady(tickets) {
    if (showing) return;
    var due = tickets.filter(function (o) { return o.status === "ready" && (o.pings || 0) > (seenPings[o.id] || 0); })[0];
    if (!due) return;
    showing = due;
    $("ready-art").innerHTML = C.stirCup({ art: true, swirl: "#f6ecdf" });
    $("ready-no").textContent = "No. " + pad(due.number);
    $("ready-title").innerHTML = C.esc(due.name) + ", your <em>" + C.esc(due.drinkName.toLowerCase()) + "</em> is ready.";
    $("ready").hidden = false;
    $("ready-ok").focus();
    C.chime("ready");
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);
    flashTitle("☕ Ready! No. " + pad(due.number));
    if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
      try { new Notification("Your coffee is ready", { body: due.drinkName + " for " + due.name + ", order No. " + due.number }); } catch (e) { /* ignore */ }
    }
  }

  function flashTitle(text) {
    clearInterval(titleTimer);
    var on = false;
    titleTimer = setInterval(function () { on = !on; document.title = on ? text : titleBase; }, 1000);
  }

  $("ready-ok").addEventListener("click", function () {
    if (showing) {
      seenPings[showing.id] = showing.pings || 0;
      C.store("cc.seen", seenPings);
    }
    showing = null;
    $("ready").hidden = true;
    clearInterval(titleTimer);
    titleTimer = null;
    document.title = titleBase;
    render();
  });

  // ---------- clicks ----------
  document.addEventListener("click", function (ev) {
    var el = ev.target.closest("[data-act]");
    if (!el) return;
    var act = el.dataset.act;
    if (act === "another") { wantsForm = true; formBuilt = false; render(); if ($("f-name")) $("f-name").focus(); }
    if (act === "tickets") { wantsForm = false; render(); }
    if (act === "cancel") {
      el.disabled = true;
      C.api("POST", "/api/orders/" + el.dataset.id + "/cancel")
        .then(function () { C.toast("Order cancelled."); forget(el.dataset.id); return refresh(); })
        .catch(function (e) { C.toast(e.message); el.disabled = false; });
    }
  });

  document.addEventListener("visibilitychange", function () { if (!document.hidden) refresh(); });

  loop();
})();
