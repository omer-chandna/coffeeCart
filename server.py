#!/usr/bin/env python3
"""Coffee Cart: a tiny home coffee-ordering server.

Standard library only, so it runs on a Raspberry Pi 2 with nothing to install.

    python3 server.py              # serves on port 8080
    PORT=80 python3 server.py      # another port
    COFFEE_PIN=4821 python3 server.py   # set the admin PIN

Guests open http://<pi-address>:8080/ and the barista opens /admin.
"""

import hmac
import json
import mimetypes
import os
import secrets
import socket
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.join(ROOT, "public")
DATA_FILE = os.environ.get("COFFEE_DATA", os.path.join(ROOT, "data.json"))
PORT = int(os.environ.get("PORT", "8080"))

STATUSES = ("queued", "making", "ready", "collected", "cancelled")
ACTIVE = ("queued", "making", "ready")
SUGAR_MAX = 4
KEEP_FINISHED = 60  # finished orders kept for the admin history

DEFAULT_DATA = {
    "settings": {"houseName": "The House Café", "open": True, "pin": ""},
    "optionGroups": [
        {"id": "milk", "name": "Milk", "choices": ["Whole", "Oat", "Almond", "Skim"]},
        {"id": "temp", "name": "Temperature", "choices": ["Hot", "Iced"]},
        {"id": "shots", "name": "Shots", "choices": ["Single", "Double"]},
    ],
    "menu": [
        {"id": "latte", "name": "Latte", "description": "Espresso, silky steamed milk",
         "available": True, "options": ["milk", "temp", "shots"]},
        {"id": "cappuccino", "name": "Cappuccino", "description": "Equal parts espresso, milk and foam",
         "available": True, "options": ["milk", "shots"]},
        {"id": "flatwhite", "name": "Flat white", "description": "Double ristretto, thin velvet milk",
         "available": True, "options": ["milk"]},
        {"id": "americano", "name": "Americano", "description": "Espresso lengthened with hot water",
         "available": True, "options": ["temp", "shots"]},
        {"id": "espresso", "name": "Espresso", "description": "A short, syrupy shot",
         "available": True, "options": ["shots"]},
    ],
    "orders": [],
    "nextNumber": 1,
}

GUEST_URL = ""
lock = threading.RLock()
state = {}


# ---------- storage ----------

def load():
    global state
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            state = json.load(f)
    except FileNotFoundError:
        state = json.loads(json.dumps(DEFAULT_DATA))
    except json.JSONDecodeError:
        os.replace(DATA_FILE, DATA_FILE + ".broken-%d" % int(time.time()))
        state = json.loads(json.dumps(DEFAULT_DATA))
    for key, value in DEFAULT_DATA.items():
        state.setdefault(key, json.loads(json.dumps(value)))
    for key, value in DEFAULT_DATA["settings"].items():
        state["settings"].setdefault(key, value)
    env_pin = os.environ.get("COFFEE_PIN")
    if env_pin:
        state["settings"]["pin"] = env_pin
    if not state["settings"]["pin"]:
        state["settings"]["pin"] = "%04d" % secrets.randbelow(10000)
    save()


def save():
    tmp = DATA_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=1)
    os.replace(tmp, DATA_FILE)  # atomic, so a power cut never leaves half a file


# ---------- helpers ----------

def now_ms():
    return int(time.time() * 1000)


def clean(text, limit):
    return " ".join(str(text or "").split())[:limit]


def slug_id():
    return uuid.uuid4().hex[:10]


def find(items, item_id):
    for item in items:
        if item.get("id") == item_id:
            return item
    return None


def public_order(order):
    return {
        "number": order["number"],
        "name": order["name"],
        "drinkName": order["drinkName"],
        "status": order["status"],
        "createdAt": order["createdAt"],
    }


def queue_position(order):
    if order["status"] not in ("queued", "making"):
        return 0
    return sum(
        1 for o in state["orders"]
        if o["status"] in ("queued", "making") and o["createdAt"] < order["createdAt"]
    )


def public_state():
    settings = state["settings"]
    active = [o for o in state["orders"] if o["status"] in ACTIVE]
    active.sort(key=lambda o: o["createdAt"])
    return {
        "settings": {"houseName": settings["houseName"], "open": settings["open"]},
        "optionGroups": state["optionGroups"],
        "menu": state["menu"],
        "queue": [public_order(o) for o in active],
        "serverTime": now_ms(),
    }


def guest_order(order):
    data = dict(order)
    data["position"] = queue_position(order)
    return data


def trim_finished():
    finished = [o for o in state["orders"] if o["status"] not in ACTIVE]
    if len(finished) > KEEP_FINISHED:
        finished.sort(key=lambda o: o["updatedAt"])
        drop = {o["id"] for o in finished[: len(finished) - KEEP_FINISHED]}
        state["orders"] = [o for o in state["orders"] if o["id"] not in drop]


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


# ---------- request handling ----------

class Handler(BaseHTTPRequestHandler):
    server_version = "CoffeeCart/1.0"

    def log_message(self, fmt, *args):  # quieter log: only API writes and errors
        if self.command != "GET" or (args and str(args[1])[0] in "45"):
            BaseHTTPRequestHandler.log_message(self, fmt, *args)

    # -- plumbing --
    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length > 20000:
            raise ApiError(413, "Request too large")
        if not length:
            return {}
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            raise ApiError(400, "Invalid JSON")
        if not isinstance(data, dict):
            raise ApiError(400, "Expected a JSON object")
        return data

    def require_admin(self):
        given = self.headers.get("X-Admin-Pin", "")
        if not hmac.compare_digest(given.encode(), state["settings"]["pin"].encode()):
            raise ApiError(401, "Wrong PIN")

    def route(self, method):
        path = urlparse(self.path).path.rstrip("/") or "/"
        parts = [p for p in path.split("/") if p]
        try:
            if parts[:1] == ["api"]:
                with lock:
                    result = self.api(method, parts[1:])
                self.send_json(200, result)
            elif method == "GET":
                self.static(path)
            else:
                raise ApiError(405, "Method not allowed")
        except ApiError as e:
            self.send_json(e.status, {"error": e.message})
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        self.route("GET")

    def do_POST(self):
        self.route("POST")

    def do_PUT(self):
        self.route("PUT")

    def do_DELETE(self):
        self.route("DELETE")

    # -- static files --
    def static(self, path):
        pages = {"/": "index.html", "/admin": "admin.html"}
        rel = pages.get(path, path.lstrip("/"))
        full = os.path.realpath(os.path.join(PUBLIC, rel))
        if not full.startswith(os.path.realpath(PUBLIC) + os.sep) or not os.path.isfile(full):
            raise ApiError(404, "Not found")
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        if full.endswith(".webp"):
            ctype = "image/webp"
        with open(full, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        cache = "public, max-age=604800" if "/img/" in full else "no-cache"
        self.send_header("Cache-Control", cache)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # -- API --
    def api(self, method, parts):
        # Guest endpoints
        if parts == ["state"] and method == "GET":
            return public_state()

        if parts == ["orders"] and method == "POST":
            return self.create_order(self.read_json())

        if len(parts) == 2 and parts[0] == "orders" and method == "GET":
            order = find(state["orders"], parts[1])
            if not order:
                raise ApiError(404, "Order not found")
            return guest_order(order)

        if len(parts) == 3 and parts[0] == "orders" and parts[2] == "cancel" and method == "POST":
            order = find(state["orders"], parts[1])
            if not order:
                raise ApiError(404, "Order not found")
            if order["status"] != "queued":
                raise ApiError(409, "This one is already being made")
            order["status"] = "cancelled"
            order["updatedAt"] = now_ms()
            save()
            return guest_order(order)

        # Admin endpoints
        if parts[:1] == ["admin"]:
            self.require_admin()
            return self.admin(method, parts[1:])

        raise ApiError(404, "Unknown endpoint")

    def create_order(self, body):
        if not state["settings"]["open"]:
            raise ApiError(409, "The bar is closed right now")
        name = clean(body.get("name"), 30)
        if not name:
            raise ApiError(400, "Add your name so we know whose cup it is")
        drink = find(state["menu"], body.get("drinkId"))
        if not drink or not drink.get("available"):
            raise ApiError(400, "That drink isn't on right now")
        chosen = {}
        raw_options = body.get("options") or {}
        for group_id in drink.get("options", []):
            group = find(state["optionGroups"], group_id)
            if not group:
                continue
            pick = raw_options.get(group_id)
            if pick in group["choices"]:
                chosen[group["name"]] = pick
            elif group["choices"]:
                chosen[group["name"]] = group["choices"][0]
        try:
            sugar = max(0, min(SUGAR_MAX, int(body.get("sugar", 0))))
        except (TypeError, ValueError):
            sugar = 0
        stamp = now_ms()
        order = {
            "id": uuid.uuid4().hex,
            "number": state["nextNumber"],
            "name": name,
            "drinkId": drink["id"],
            "drinkName": drink["name"],
            "options": chosen,
            "sugar": sugar,
            "notes": clean(body.get("notes"), 140),
            "status": "queued",
            "pings": 0,
            "createdAt": stamp,
            "updatedAt": stamp,
        }
        state["nextNumber"] += 1
        state["orders"].append(order)
        save()
        return guest_order(order)

    def admin(self, method, parts):
        if parts == ["check"]:
            return {"ok": True, "guestUrl": GUEST_URL}

        if parts == ["orders"] and method == "GET":
            orders = sorted(state["orders"], key=lambda o: o["createdAt"])
            return {"orders": orders, "serverTime": now_ms()}

        if len(parts) == 3 and parts[0] == "orders" and method == "POST":
            order = find(state["orders"], parts[1])
            if not order:
                raise ApiError(404, "Order not found")
            action = parts[2]
            body = self.read_json()
            if action == "status":
                status = body.get("status")
                if status not in STATUSES:
                    raise ApiError(400, "Unknown status")
                order["status"] = status
                if status == "ready":
                    order["pings"] = order.get("pings", 0) + 1
            elif action == "ping":
                order["pings"] = order.get("pings", 0) + 1
            else:
                raise ApiError(404, "Unknown action")
            order["updatedAt"] = now_ms()
            trim_finished()
            save()
            return order

        if parts == ["orders", "clear"] and method == "POST":
            state["orders"] = [o for o in state["orders"] if o["status"] in ACTIVE]
            save()
            return {"ok": True}

        if parts[:1] == ["menu"]:
            return self.crud(method, parts[1:], state["menu"], self.menu_fields)

        if parts[:1] == ["options"]:
            result = self.crud(method, parts[1:], state["optionGroups"], self.group_fields)
            if method == "DELETE":  # drop a deleted group from every drink
                for drink in state["menu"]:
                    drink["options"] = [g for g in drink.get("options", []) if find(state["optionGroups"], g)]
                save()
            return result

        if parts == ["settings"] and method == "POST":
            body = self.read_json()
            settings = state["settings"]
            if "houseName" in body:
                settings["houseName"] = clean(body["houseName"], 40) or settings["houseName"]
            if "open" in body:
                settings["open"] = bool(body["open"])
            if body.get("pin"):
                pin = clean(body["pin"], 12)
                if len(pin) < 4:
                    raise ApiError(400, "Use a PIN of at least 4 characters")
                settings["pin"] = pin
            save()
            return {"houseName": settings["houseName"], "open": settings["open"]}

        raise ApiError(404, "Unknown admin endpoint")

    def menu_fields(self, body, item):
        if "name" in body:
            item["name"] = clean(body["name"], 40)
        if "description" in body:
            item["description"] = clean(body["description"], 90)
        if "available" in body:
            item["available"] = bool(body["available"])
        if "options" in body and isinstance(body["options"], list):
            item["options"] = [g for g in body["options"] if find(state["optionGroups"], g)]
        if not item.get("name"):
            raise ApiError(400, "Give the drink a name")
        item.setdefault("description", "")
        item.setdefault("available", True)
        item.setdefault("options", [])

    def group_fields(self, body, item):
        if "name" in body:
            item["name"] = clean(body["name"], 30)
        if "choices" in body and isinstance(body["choices"], list):
            choices = [clean(c, 30) for c in body["choices"]]
            item["choices"] = [c for i, c in enumerate(choices) if c and c not in choices[:i]][:12]
        if not item.get("name"):
            raise ApiError(400, "Give the option a name")
        if not item.get("choices"):
            raise ApiError(400, "Add at least one choice")

    def crud(self, method, parts, items, apply_fields):
        if not parts and method == "POST":
            item = {"id": slug_id()}
            apply_fields(self.read_json(), item)
            items.append(item)
            save()
            return item
        if len(parts) == 1:
            item = find(items, parts[0])
            if not item:
                raise ApiError(404, "Not found")
            if method == "PUT":
                trial = dict(item)
                apply_fields(self.read_json(), trial)
                item.update(trial)
                save()
                return item
            if method == "DELETE":
                items.remove(item)
                save()
                return {"ok": True}
        raise ApiError(405, "Method not allowed")


def lan_address():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        addr = s.getsockname()[0]
        s.close()
        return addr
    except OSError:
        return "localhost"


def main():
    global GUEST_URL
    load()
    httpd = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    httpd.daemon_threads = True
    host = lan_address()
    suffix = "" if PORT == 80 else ":%d" % PORT
    GUEST_URL = "http://%s%s/" % (host, suffix)
    print("")
    print("  Coffee Cart is brewing")
    print("  Guests:  http://%s%s/" % (host, suffix))
    print("  Admin:   http://%s%s/admin   (PIN %s)" % (host, suffix, state["settings"]["pin"]))
    print("")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
