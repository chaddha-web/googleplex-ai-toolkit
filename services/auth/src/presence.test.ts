import assert from "node:assert";
import { recordPresence, activeViewers, isValidVid, _resetPresence } from "./presence.js";

// 8.8.8.8 (Google DNS) geolocates via the offline geoip-lite DB.
const IP = "8.8.8.8";
const vid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

_resetPresence();
assert.equal(isValidVid("not-a-uuid"), false);
assert.equal(isValidVid(""), false);
assert.equal(isValidVid(vid(1)), true);

const t = 1_000_000;
recordPresence(vid(1), IP, t);
recordPresence(vid(2), IP, t); // same cell -> count 2
let r = activeViewers(t);
assert.equal(r.total, 2, "two live viewers");
assert.equal(r.clusters.length, 1, "same rounded cell merges");
assert.equal(r.clusters[0]!.count, 2);

// Expiry: 61s later with no new ping -> gone.
r = activeViewers(t + 61_000);
assert.equal(r.total, 0, "expired after TTL");

// Private IP -> ignored (never stored).
_resetPresence();
recordPresence(vid(3), "10.0.0.1", t);
assert.equal(activeViewers(t).total, 0, "private IP ignored");

// null IP -> ignored, no throw.
recordPresence(vid(4), null, t);
assert.equal(activeViewers(t).total, 0, "null IP ignored");

console.log("presence.test OK");
