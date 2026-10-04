import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Officiating Intelligence is available to every active account", async () => {
  const [appSource, headerSource] = await Promise.all([
    readFile(new URL("./App.jsx", import.meta.url), "utf8"),
    readFile(new URL("./components/Header.jsx", import.meta.url), "utf8"),
  ]);

  assert.match(appSource, /path="\/officiating"\s+element=\{<Officiating \/>\}/);
  assert.doesNotMatch(appSource, /canUseTools \? <Officiating/);
  assert.match(headerSource, /to="\/officiating\?tab=officials"/);
});
