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
      pill.className = "status closed";
      pill.lastElementChild.textContent = "Offline";
      return;
    }
    pill.className = "status" + (open ? "" : " closed");
    pill.lastElementChild.textContent = open ? "Open" : "Closed";
    var waiting = data.queue.filter(function (o) { return o.status !== "ready"; }).length;
    var on = data.menu.filter(function (d) { return d.available; }).length;
    $("fact-open").textContent = open ? "The line" : "Bar closed";
    $("fact-menu").textContent = on + (on === 1 ? " drink" : " drinks");
    $("fact-queue").textContent = waiting === 0 ? "No wait" : waiting + (waiting === 1 ? " cup ahead" : " cups ahead");
    $("queue-side").textContent = data.queue.length ? data.queue.length + (data.queue.length === 1 ? " order" : " orders") : "Live";
  }

  function renderQueue() {
    var q = data.queue;
    var sig = JSON.stringify([q, mine]);
    if ($("queue").dataset.sig === sig) return;
    $("queue").dataset.sig = sig;
    if (!q.length) {
      $("queue").innerHTML = '<div class="empty"><p class="title-1">Nobody waiting.</p><p class="label mute">The machine is warm</p></div>';
      return;
    }
    var mineNums = mine.map(function (id) { return orders[id] && orders[id].number; });
    $("queue").innerHTML = '<ol class="queue">' + q.map(function (o) {
      var isMine = mineNums.indexOf(o.number) !== -1;
      return '<li class="q' + (isMine ? " mine" : "") + '">' +
        '<span class="no">' + pad(o.number) + "</span>" +
        '<span class="who">' + C.esc(o.name) + "</span>" +
        '<span class="st label ' + o.status + '">' + statusWord(o.status) + "</span>" +
        '<span class="what label">' + C.esc(o.drinkName) + "</span></li>";
    }).join("") + "</ol>";
  }

  /* A little glass showing what the drink is made of: espresso at the bottom, then milk or water, then foam. */
  function glassArt(name) {
    var n = name.toLowerCase(), layers;
    if (/espresso|ristretto|shot/.test(n)) layers = [["#3b2010", 0.5], ["#c98a4f", 0.14]];
    else if (/americano|long black|filter|drip|black/.test(n)) layers = [["#3b2010", 0.3], ["#5d3620", 0.55]];
    else if (/cappuccino/.test(n)) layers = [["#3b2010", 0.28], ["#c79a6c", 0.28], ["#fff5e8", 0.3]];
    else if (/flat/.test(n)) layers = [["#3b2010", 0.34], ["#c79a6c", 0.44], ["#fff5e8", 0.08]];
    else if (/mocha|chocolate/.test(n)) layers = [["#2a1409", 0.3], ["#7b4a2a", 0.4], ["#fff5e8", 0.16]];
    else if (/macchiato|cortado/.test(n)) layers = [["#3b2010", 0.4], ["#c79a6c", 0.2], ["#fff5e8", 0.1]];
    else if (/tea|chai|matcha/.test(n)) layers = [["#8a9a4a", 0.66], ["#fff5e8", 0.12]];
    else layers = [["#3b2010", 0.2], ["#c79a6c", 0.52], ["#fff5e8", 0.14]];
    var id = "g" + Math.random().toString(36).slice(2, 8), y = 42, out = "";
    layers.forEach(function (l) {
      var h = l[1] * 34;
      y -= h;
      out += '<rect x="10" y="' + y.toFixed(1) + '" width="28" height="' + (h + 0.5).toFixed(1) + '" fill="' + l[0] + '"/>';
    });
    return '<svg viewBox="0 0 48 48" aria-hidden="true"><defs><clipPath id="' + id + '"><path d="M12 8h24l-2.5 31a3 3 0 0 1-3 3h-13a3 3 0 0 1-3-3z"/></clipPath></defs>' +
      '<path d="M12 8h24l-2.5 31a3 3 0 0 1-3 3h-13a3 3 0 0 1-3-3z" fill="rgba(255,250,244,.55)"/>' +
      '<g clip-path="url(#' + id + ')">' + out + "</g>" +
      '<path d="M12 8h24l-2.5 31a3 3 0 0 1-3 3h-13a3 3 0 0 1-3-3z" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="1.5"/>' +
      '<path d="M16 12l1.6 24" stroke="rgba(255,255,255,.5)" stroke-width="1.5" stroke-linecap="round"/></svg>';
  }

  function statusWord(status) {
    return { queued: "In line", making: "Brewing", ready: "Ready", collected: "Picked up", cancelled: "Cancelled" }[status];
  }

  function specLine(o) {
    var bits = Object.keys(o.options || {}).map(function (k) { return o.options[k]; });
    bits.push(C.SUGAR[o.sugar] || "No sugar");
    return bits.join(" · ");
  }

  function renderTickets(tickets) {
    var view = $("order-view");
    // only replace the markup when an order changed, so the live figure keeps running
    var sig = "t" + JSON.stringify(tickets.map(function (o) { return [o.id, o.status, o.position]; }));
    if (view.dataset.sig === sig) return;
    view.dataset.sig = sig;
    $("order-side").textContent = tickets.length > 1 ? tickets.length + " tickets" : "Ticket";
    view.innerHTML = tickets.map(ticketHtml).join("") +
      '<div class="row"><button class="btn line" type="button" data-act="another">Order another <span class="arrow" aria-hidden="true">↗</span></button></div>';
    tickets.forEach(function (o) {
      var canvas = document.getElementById("fig-" + o.id);
      if (canvas) C.ascii(canvas, { speed: o.status === "making" ? 1.6 : o.status === "ready" ? 0.5 : 0.25, marker: o.status !== "collected" });
    });
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
    return '<article class="ticket' + (o.status === "ready" ? " is-ready" : "") + '">' +
      '<div class="ticket-top"><div class="ticket-no" aria-label="Order number ' + o.number + '">' + pad(o.number) + "</div>" +
      '<div class="ticket-who"><b>' + C.esc(o.name) + "'s " + C.esc(o.drinkName.toLowerCase()) + "</b>" +
      "<span>" + C.esc(specLine(o)) + "</span>" + (o.notes ? "<span>“" + C.esc(o.notes) + "”</span>" : "") + "</div></div>" +
      '<figure class="stage"><canvas id="fig-' + o.id + '" aria-hidden="true"></canvas></figure>' +
      '<ol class="track label" aria-label="Order progress">' +
      ["In line", "Brewing", "Ready"].map(function (label, i) {
        var cls = i < at || (i === at && o.status === "ready") || at === 3 ? "done" : i === at ? "now" : "";
        return '<li class="' + cls + '">' + label + "</li>";
      }).join("") + "</ol>" +
      '<p class="say" aria-live="polite">' + line + "</p>" +
      (o.status === "queued" ? '<div class="row"><button class="text-btn" type="button" data-act="cancel" data-id="' + o.id + '">Cancel this order ×</button></div>' : "") +
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
    $("order-side").textContent = "5 steps";

    var available = data.menu.filter(function (d) { return d.available; });
    var hasTickets = mine.some(function (id) { return orders[id]; });
    var back = hasTickets ? '<div class="row"><button class="text-btn" type="button" data-act="tickets">← Back to my ticket</button></div>' : "";

    if (!data.settings.open) {
      view.innerHTML = back + '<div class="empty"><p class="title-1">The bar is closed for now.</p><p class="label mute">Check back in a bit</p></div>';
      return;
    }
    if (!available.length) {
      view.innerHTML = back + '<div class="empty"><p class="title-1">Nothing on the menu yet.</p><p class="label mute">The barista is setting up</p></div>';
      return;
    }

    view.innerHTML = back + '<form id="order-form" novalidate>' +
      '<div class="step"><div class="step-head label"><label for="f-name">01 Name</label><span>Required</span></div>' +
      '<input class="input" id="f-name" name="name" autocomplete="given-name" maxlength="30" placeholder="Your name">' +
      '<p class="error" id="e-name"></p></div>' +

      '<fieldset class="step"><legend class="sr-only">Pick a drink</legend>' +
      '<div class="step-head label" aria-hidden="true"><span>02 Drink</span><span>' + available.length + " on tonight</span></div>" +
      '<div class="menu">' + available.map(function (d, i) {
        return '<label class="drink"><input type="radio" name="drink" value="' + C.esc(d.id) + '"' + (i === 0 ? " checked" : "") + ">" +
          '<span class="drink-row"><span class="glass-art">' + glassArt(d.name) + '</span><span class="name">' + C.esc(d.name) + "</span>" +
          '<span class="pick" aria-hidden="true"></span>' +
          '<span class="desc">' + C.esc(d.description || "") + "</span></span></label>";
      }).join("") + "</div></fieldset>" +

      '<div class="step" id="opt-step"><div class="step-head label"><span>03 Options</span><span>Your call</span></div>' +
      '<div class="opt-groups">' + data.optionGroups.map(function (g) {
        return '<fieldset class="opt-group" data-group="' + C.esc(g.id) + '"><legend class="label">' + C.esc(g.name) + "</legend>" +
          '<div class="toggles">' + g.choices.map(function (c, i) {
            return '<label class="toggle"><input type="radio" name="opt-' + C.esc(g.id) + '" value="' + C.esc(c) + '"' + (i === 0 ? " checked" : "") + "><span>" + C.esc(c) + "</span></label>";
          }).join("") + "</div></fieldset>";
      }).join("") + "</div></div>" +

      '<fieldset class="step"><legend class="sr-only">Sugar</legend>' +
      '<div class="step-head label" aria-hidden="true"><span>04 Sugar</span><span>Spoons</span></div>' +
      '<div class="sugar-top"><div class="sugar-now" id="sugar-now">No sugar</div><div class="cubes" id="cubes" aria-hidden="true"><i></i><i></i><i></i><i></i></div></div>' +
      '<div class="levels">' + C.SUGAR.map(function (label, i) {
        return '<label class="level" title="' + label + '"><input type="radio" name="sugar" value="' + i + '"' + (i === 0 ? " checked" : "") + ' aria-label="' + label + '"><span>' + i + "</span></label>";
      }).join("") + "</div></fieldset>" +

      '<div class="step"><div class="step-head label"><label for="f-notes">05 Notes</label><span>Optional</span></div>' +
      '<textarea class="textarea" id="f-notes" name="notes" maxlength="140" placeholder="Extra hot, half caf, a little cinnamon"></textarea></div>' +

      '<p class="error" id="e-form" role="alert"></p>' +
      '<div class="submit"><button class="btn accent" type="submit" id="f-submit"><span>Send my order</span><span class="arrow" aria-hidden="true">↗</span></button></div>' +
      "</form>";

    var form = $("order-form");
    form.name.value = (keep && keep.name) || C.store("cc.name") || "";
    if (keep) applyForm(keep);
    form.addEventListener("change", syncForm);
    form.addEventListener("input", syncForm);
    form.addEventListener("submit", submit);
    syncForm();
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
    document.querySelectorAll("#cubes i").forEach(function (el, i) { el.classList.toggle("on", i < v.sugar); });
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
    btn.firstChild.textContent = "Sending";
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
        C.toast("Order " + pad(order.number) + " is in. We will call you.");
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

  var showing = null, readyFig = null;
  function checkReady(tickets) {
    if (showing) return;
    var due = tickets.filter(function (o) { return o.status === "ready" && (o.pings || 0) > (seenPings[o.id] || 0); })[0];
    if (!due) return;
    showing = due;
    $("ready-no").textContent = pad(due.number);
    $("ready-title").textContent = due.name + ", your " + due.drinkName.toLowerCase() + " is ready.";
    $("ready").hidden = false;
    if (!readyFig) readyFig = C.ascii($("fig-ready"), { speed: 1.2, marker: false });
    $("ready-ok").focus();
    C.chime("ready");
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);
    flashTitle("☕ Ready: order " + pad(due.number));
    if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
      try { new Notification("Your coffee is ready", { body: due.drinkName + " for " + due.name + ", order " + due.number }); } catch (e) { /* ignore */ }
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
