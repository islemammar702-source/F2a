// Ensures the Arabic dictionary covers every French key and that strings are really translated.
import { test } from "node:test";
import assert from "node:assert/strict";
import fr from "../src/lib/i18n/fr.ts";
import ar from "../src/lib/i18n/ar.ts";

type Path = string[];
function paths(o: unknown, prefix: Path = []): Path[] {
  if (typeof o !== "object" || o === null) return [prefix];
  return Object.entries(o).flatMap(([k, v]) => paths(v, [...prefix, k]));
}
const get = (d: unknown, p: Path) => p.reduce((o: any, k) => o?.[k], d);

test("Arabic translation is complete", () => {
  const missing = paths(fr).filter((p) => typeof get(ar, p) !== "string").map((p) => p.join("."));
  assert.deepEqual(missing, []);
});

test("Arabic strings are actually translated", () => {
  const same = paths(fr)
    .filter((p) => {
      const f = String(get(fr, p));
      return get(ar, p) === f && /[a-zà-ÿ]{4,}/i.test(f) && !/F2A|MANAGER|WhatsApp|IBAN|Excel|PDF/.test(f);
    })
    .map((p) => p.join("."));
  assert.deepEqual(same, []);
});
