/* Barista page: PIN sign-in, the live board, menu and option editing, settings. */
(function () {
  "use strict";
  var C = window.Cafe;
  var $ = function (id) { return document.getElementById(id); };

  var pin = C.store("cc.pin") || "";
  var pub = { menu: [], optionGroups: [], settings: { houseName: "", open: true } };
  var orders = [];
  var serverTime = Date.now();
  var known = null;          // order ids seen so far, to spot new ones
  var fresh = {};            // id -> true for a few seconds after arriving
  var timer = null;

  function adminApi(method, path, body) {
    return C.api(method, "/api/admin/" + path, body, { "X-Admin-Pin": pin }).catch(function (e) {
      if (e.status === 401) signOut("That PIN didn't work.");
      throw e;
    });
  }

  // ---------- sign in ----------
  $("login-cup").innerHTML = C.stirCup();

  function showLogin(msg) {
    $("app").hidden = true;
    $("login").hidden = false;
    $("pin-error").textContent = msg || "";
    $("pin").value = "";
    setTimeout(function () { $("pin").focus(); }, 50);
  }

  function signOut(msg) {
    pin = "";
    C.store("cc.pin", "");
    clearTimeout(timer);
    known = null;
    showLogin(msg);
  }

  $("login-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    C.unlockAudio();
    pin = $("pin").value.trim();
    if (!pin) { $("pin-error").textContent = "Enter the PIN."; return; }
    start();
  });

  function start() {
    adminApi("GET", "check").then(function (res) {
      C.store("cc.pin", pin);
      $("login").hidden = true;
      $("app").hidden = false;
      var url = res.guestUrl || location.origin + "/";
      $("guest-link").innerHTML = 'Guests order at <a href="' + C.esc(url) + '" target="_blank" rel="noopener"><b>' + C.esc(url.replace(/^https?:\/\//, "").replace(/\/$/, "")) + "</b></a>";
      loop();
    }).catch(function (e) {
      if (e.status !== 401) showLogin("Can't reach the server. Is it running?");
    });
  }

  // ---------- polling ----------
  function refresh() {
    return Promise.all([
      adminApi("GET", "orders").then(function (r) { orders = r.orders; serverTime = r.serverTime; }),
      C.api("GET", "/api/state").then(function (s) { pub = s; }),
    ]).then(render);
  }

  function loop() {
    clearTimeout(timer);
    refresh().catch(function () {}).then(function () {
      timer = setTimeout(loop, document.hidden ? 5000 : 2500);
    });
  }

  // ---------- render ----------
  function render() {
    document.querySelectorAll("[data-house]").forEach(function (el) { el.textContent = pub.settings.houseName; });
    document.title = "Barista · " + pub.settings.houseName;
    $("open-toggle").checked = pub.settings.open;
    $("open-label").textContent = pub.settings.open ? "Taking orders" : "Closed";
    if (document.activeElement !== $("s-house")) $("s-house").value = pub.settings.houseName;

    // new-order chime
    var ids = orders.map(function (o) { return o.id; });
    if (known) {
      var arrivals = orders.filter(function (o) { return known.indexOf(o.id) === -1 && o.status === "queued"; });
      if (arrivals.length) {
        C.chime("new");
        C.toast(arrivals.length === 1 ? "New order: " + arrivals[0].name + "'s " + arrivals[0].drinkName.toLowerCase() : arrivals.length + " new orders");
        arrivals.forEach(function (o) {
          fresh[o.id] = true;
          setTimeout(function () { delete fresh[o.id]; renderBoard(true); }, 6000);
        });
      }
    }
    known = ids;

    renderBoard();
    renderMenu();
    renderGroups();
  }

  var boardSig = "";
  function renderBoard(force) {
    var minute = Math.floor(serverTime / 60000);
    var sig = JSON.stringify([orders, minute, Object.keys(fresh)]);
    if (sig === boardSig && !force) return;
    boardSig = sig;

    var lanes = { queued: [], making: [], ready: [] };
    var done = [];
    orders.forEach(function (o) { (lanes[o.status] || done).push(o); });
    var waiting = lanes.queued.length + lanes.making.length;
    $("tab-count").textContent = waiting || "";

    var empty = {
      queued: "No one waiting. Enjoy the quiet.",
      making: "Nothing brewing. Start one from the line.",
      ready: "Finished drinks land here.",
    };
    Object.keys(lanes).forEach(function (k) {
      document.querySelector('[data-count="' + k + '"]').textContent = lanes[k].length || "";
      $("lane-" + k).innerHTML = lanes[k].length ? lanes[k].map(orderCard).join("") : '<div class="lane-empty">' + empty[k] + "</div>";
    });

    done.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
    $("history-count").textContent = done.length || "";
    $("history").innerHTML = done.length
      ? done.map(function (o) {
          return '<div class="history-row"><span class="q-no">' + o.number + "</span><span><b>" + C.esc(o.name) + "</b> · " + C.esc(o.drinkName) + "</span>" +
            '<span class="tag ' + o.status + '">' + (o.status === "collected" ? "Picked up" : "Cancelled") + "</span>" +
            '<button class="text-btn" data-act="status" data-status="queued" data-id="' + o.id + '">Back to line</button></div>';
        }).join("") + '<div class="row-actions" style="margin-top:12px"><button class="text-btn danger" data-act="clear">Clear history</button></div>'
      : '<p class="mute">Nothing yet.</p>';
  }

  function orderCard(o) {
    var specs = Object.keys(o.options || {}).map(function (k) {
      return '<span class="spec-chip" title="' + C.esc(k) + '">' + C.esc(o.options[k]) + "</span>";
    });
    specs.push('<span class="spec-chip sugar">' + C.sugarCubes(o.sugar) + C.esc(C.SUGAR[o.sugar]) + "</span>");
    var actions = {
      queued: '<button class="btn small" data-act="status" data-status="making" data-id="' + o.id + '">Start brewing</button>' +
        '<button class="text-btn danger" data-act="status" data-status="cancelled" data-id="' + o.id + '">Cancel</button>',
      making: '<button class="btn small ok" data-act="status" data-status="ready" data-id="' + o.id + '">Ready, call ' + C.esc(o.name) + "</button>" +
        '<button class="text-btn" data-act="status" data-status="queued" data-id="' + o.id + '">Back to line</button>',
      ready: '<button class="btn small" data-act="status" data-status="collected" data-id="' + o.id + '">Picked up</button>' +
        '<button class="text-btn" data-act="ping" data-id="' + o.id + '">Call again</button>' +
        (o.pings > 1 ? '<span class="pinged">Called ' + o.pings + "×</span>" : ""),
    }[o.status];
    var mini = o.status === "making" ? '<div class="order-mini">' + C.stirCup() + "</div>" : "";
    return '<article class="order' + (fresh[o.id] ? " fresh" : "") + '">' +
      '<div class="order-head"><span class="order-no">' + o.number + "</span>" +
      '<span class="order-who"><b>' + C.esc(o.name) + "</b><span>" + C.esc(o.drinkName) + "</span></span>" +
      (mini || '<span class="order-time">' + C.minutesAgo(o.createdAt, serverTime) + "</span>") + "</div>" +
      '<div class="order-specs">' + specs.join("") + "</div>" +
      (o.notes ? '<p class="order-note">' + C.esc(o.notes) + "</p>" : "") +
      '<div class="order-actions">' + actions + "</div></article>";
  }

  // ---------- menu ----------
  var menuSig = "";
  function renderMenu() {
    var sig = JSON.stringify([pub.menu, pub.optionGroups]);
    if (sig === menuSig) return;
    menuSig = sig;
    var groupName = {};
    pub.optionGroups.forEach(function (g) { groupName[g.id] = g.name; });
    $("menu-list").innerHTML = pub.menu.length ? pub.menu.map(function (d) {
      var opts = (d.options || []).map(function (id) { return groupName[id]; }).filter(Boolean);
      return '<article class="item' + (d.available ? "" : " off") + '">' +
        '<span class="glyph">' + C.steamCup() + "</span>" +
        "<div><h3>" + C.esc(d.name) + "</h3>" + (d.description ? "<p>" + C.esc(d.description) + "</p>" : "") +
        '<div class="meta">' + (opts.length ? "Options: " + C.esc(opts.join(", ")) : "No options") + "</div></div>" +
        '<div class="item-actions">' +
        '<label class="switch"><input type="checkbox" data-act="avail" data-id="' + d.id + '"' + (d.available ? " checked" : "") + ' aria-label="' + C.esc(d.name) + ' on the menu"><span class="switch-track" aria-hidden="true"><span class="switch-knob"></span></span><span class="switch-label">' + (d.available ? "On" : "Off") + "</span></label>" +
        '<button class="text-btn" data-act="edit-drink" data-id="' + d.id + '">Edit</button>' +
        '<button class="text-btn danger" data-act="del-drink" data-id="' + d.id + '">Remove</button>' +
        "</div></article>";
    }).join("") : '<div class="lane-empty">No drinks yet. Add your first one.</div>';
    drawOptionPicker();
  }

  function drawOptionPicker(selected) {
    var box = $("d-options");
    var current = selected || Array.prototype.map.call(box.querySelectorAll("input:checked"), function (i) { return i.value; });
    box.innerHTML = pub.optionGroups.map(function (g) {
      return '<label class="chip"><input type="checkbox" value="' + C.esc(g.id) + '"' + (current.indexOf(g.id) !== -1 ? " checked" : "") + "><span>" + C.esc(g.name) + "</span></label>";
    }).join("") || '<span class="mute">Add options in the Options tab.</span>';
  }

  function resetDrinkForm() {
    var f = $("drink-form");
    f.reset();
    f.id.value = "";
    $("drink-form-title").textContent = "Add a drink";
    $("drink-submit").textContent = "Add to the menu";
    $("drink-cancel").hidden = true;
    $("drink-error").textContent = "";
    drawOptionPicker([]);
  }

  $("drink-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var f = ev.target;
    var body = {
      name: f.name.value.trim(),
      description: f.description.value.trim(),
      options: Array.prototype.map.call($("d-options").querySelectorAll("input:checked"), function (i) { return i.value; }),
    };
    if (!body.name) { $("drink-error").textContent = "Give the drink a name."; f.name.focus(); return; }
    var editing = f.id.value;
    adminApi(editing ? "PUT" : "POST", "menu" + (editing ? "/" + editing : ""), body).then(function () {
      C.toast(editing ? "Drink updated." : body.name + " is on the menu.");
      resetDrinkForm();
      refresh();
    }).catch(function (e) { $("drink-error").textContent = e.message; });
  });
  $("drink-cancel").addEventListener("click", resetDrinkForm);

  // ---------- option groups ----------
  var groupSig = "";
  function renderGroups() {
    var sig = JSON.stringify(pub.optionGroups);
    if (sig === groupSig) return;
    groupSig = sig;
    $("group-list").innerHTML = pub.optionGroups.length ? pub.optionGroups.map(function (g) {
      return '<article class="item group-item"><div><h3>' + C.esc(g.name) + "</h3>" +
        '<div class="order-specs" style="margin-top:8px">' + g.choices.map(function (c, i) {
          return '<span class="spec-chip"' + (i === 0 ? ' title="Default"' : "") + ">" + C.esc(c) + "</span>";
        }).join("") + "</div></div>" +
        '<div class="item-actions"><button class="text-btn" data-act="edit-group" data-id="' + g.id + '">Edit</button>' +
        '<button class="text-btn danger" data-act="del-group" data-id="' + g.id + '">Remove</button></div></article>';
    }).join("") : '<div class="lane-empty">No options yet.</div>';
  }

  function resetGroupForm() {
    var f = $("group-form");
    f.reset();
    f.id.value = "";
    $("group-form-title").textContent = "Add an option";
    $("group-submit").textContent = "Add option";
    $("group-cancel").hidden = true;
    $("group-error").textContent = "";
  }

  $("group-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var f = ev.target;
    var body = {
      name: f.name.value.trim(),
      choices: f.choices.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean),
    };
    if (!body.name) { $("group-error").textContent = "Give the option a name."; return; }
    if (!body.choices.length) { $("group-error").textContent = "Add at least one choice."; return; }
    var editing = f.id.value;
    adminApi(editing ? "PUT" : "POST", "options" + (editing ? "/" + editing : ""), body).then(function () {
      C.toast(editing ? "Option updated." : body.name + " added. Tick it on a drink to offer it.");
      resetGroupForm();
      refresh();
    }).catch(function (e) { $("group-error").textContent = e.message; });
  });
  $("group-cancel").addEventListener("click", resetGroupForm);

  // ---------- settings ----------
  $("settings-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var f = ev.target;
    var body = { houseName: f.houseName.value.trim() };
    var newPin = f.pin.value.trim();
    if (newPin) body.pin = newPin;
    adminApi("POST", "settings", body).then(function () {
      if (newPin) { pin = newPin; C.store("cc.pin", pin); }
      f.pin.value = "";
      $("settings-error").textContent = "";
      C.toast("Settings saved.");
      refresh();
    }).catch(function (e) { $("settings-error").textContent = e.message; });
  });

  $("open-toggle").addEventListener("change", function (ev) {
    adminApi("POST", "settings", { open: ev.target.checked }).then(function (s) {
      C.toast(s.open ? "The bar is open." : "Closed. Guests can't order for now.");
      refresh();
    });
  });

  $("test-sound").addEventListener("click", function () { C.unlockAudio(); setTimeout(function () { C.chime("new"); }, 50); });
  $("sign-out").addEventListener("click", function () { signOut(); });

  // ---------- tabs ----------
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));
  function selectTab(name) {
    tabs.forEach(function (t) {
      var on = t.dataset.tab === name;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      $("tab-" + t.dataset.tab).hidden = !on;
    });
    C.store("cc.tab", name);
  }
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { selectTab(t.dataset.tab); });
    t.addEventListener("keydown", function (ev) {
      var d = ev.key === "ArrowRight" ? 1 : ev.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      var next = tabs[(i + d + tabs.length) % tabs.length];
      next.focus();
      selectTab(next.dataset.tab);
    });
  });
  selectTab(C.store("cc.tab") || "queue");

  // ---------- actions ----------
  document.addEventListener("click", function (ev) {
    var el = ev.target.closest("[data-act]");
    if (!el || el.type === "checkbox") return;
    C.unlockAudio();
    var id = el.dataset.id;
    var act = el.dataset.act;
    if (act === "status") {
      el.disabled = true;
      adminApi("POST", "orders/" + id + "/status", { status: el.dataset.status }).then(function (o) {
        if (o.status === "ready") C.toast(o.name + " has been called.");
        refresh();
      }).catch(function (e) { C.toast(e.message); el.disabled = false; });
    }
    if (act === "ping") {
      adminApi("POST", "orders/" + id + "/ping").then(function (o) { C.toast("Called " + o.name + " again."); refresh(); });
    }
    if (act === "clear") {
      adminApi("POST", "orders/clear").then(function () { C.toast("History cleared."); refresh(); });
    }
    if (act === "edit-drink") {
      var d = pub.menu.filter(function (x) { return x.id === id; })[0];
      var f = $("drink-form");
      f.id.value = d.id;
      f.name.value = d.name;
      f.description.value = d.description || "";
      drawOptionPicker(d.options || []);
      $("drink-form-title").textContent = "Edit " + d.name;
      $("drink-submit").textContent = "Save changes";
      $("drink-cancel").hidden = false;
      f.scrollIntoView({ behavior: "smooth", block: "center" });
      f.name.focus({ preventScroll: true });
    }
    if (act === "del-drink") {
      var dn = pub.menu.filter(function (x) { return x.id === id; })[0];
      if (!confirm("Remove " + dn.name + " from the menu?")) return;
      adminApi("DELETE", "menu/" + id).then(function () { C.toast(dn.name + " removed."); refresh(); });
    }
    if (act === "edit-group") {
      var g = pub.optionGroups.filter(function (x) { return x.id === id; })[0];
      var gf = $("group-form");
      gf.id.value = g.id;
      gf.name.value = g.name;
      gf.choices.value = g.choices.join(", ");
      $("group-form-title").textContent = "Edit " + g.name;
      $("group-submit").textContent = "Save changes";
      $("group-cancel").hidden = false;
      gf.scrollIntoView({ behavior: "smooth", block: "center" });
      gf.name.focus({ preventScroll: true });
    }
    if (act === "del-group") {
      var gn = pub.optionGroups.filter(function (x) { return x.id === id; })[0];
      if (!confirm("Remove the " + gn.name + " option from every drink?")) return;
      adminApi("DELETE", "options/" + id).then(function () { C.toast(gn.name + " removed."); refresh(); });
    }
  });

  document.addEventListener("change", function (ev) {
    var el = ev.target;
    if (el.dataset.act !== "avail") return;
    adminApi("PUT", "menu/" + el.dataset.id, { available: el.checked }).then(function (d) {
      C.toast(d.name + (d.available ? " is back on." : " is off the menu."));
      refresh();
    });
  });

  document.addEventListener("visibilitychange", function () { if (!document.hidden && pin && !$("app").hidden) loop(); });

  if (pin) start(); else showLogin();
})();
