import { assert, assertEquals } from "jsr:@std/assert";

const functionsRoot = new URL("../", import.meta.url);
const configText = await Deno.readTextFile(new URL("../../config.toml", import.meta.url));
const functionNames: string[] = [];
for await (const entry of Deno.readDir(functionsRoot)) {
  if (!entry.isDirectory || entry.name === "_shared") continue;
  try {
    await Deno.stat(new URL(`./${entry.name}/index.ts`, functionsRoot));
    functionNames.push(entry.name);
  } catch {
    // Ignore non-function support directories.
  }
}
functionNames.sort();

Deno.test("every Edge Function has an explicit JWT policy and request contract", async () => {
  assert(functionNames.length >= 16);
  for (const name of functionNames) {
    const source = await Deno.readTextFile(new URL(`./${name}/index.ts`, functionsRoot));
    assert(configText.includes(`[functions.${name}]`), `${name} is missing from config.toml`);
    assert(/verify_jwt\s*=\s*(true|false)/.test(configText.split(`[functions.${name}]`)[1]?.split("[functions.")[0] || ""), `${name} has no explicit verify_jwt value`);
    assert(source.includes("Deno.serve"), `${name} does not register a handler`);
    assert(source.includes('=== "OPTIONS"') || source.includes("=== 'OPTIONS'"), `${name} does not handle CORS preflight`);
    assert(source.includes("Access-Control-Allow-Origin"), `${name} does not define CORS headers`);
  }
});

Deno.test("Edge Function contract inventory matches the deployment surface", () => {
  assertEquals(functionNames.length, 17);
});

Deno.test("AI-backed endpoints enforce active-user rate limits and bounded input", async () => {
  for (const name of ["game-analysis", "custom-requests"]) {
    const source = await Deno.readTextFile(new URL(`./${name}/index.ts`, functionsRoot));
    assert(source.includes("requireActiveRateLimitedUser"), `${name} has no active-user rate limit`);
    assert(source.includes("requestBodyTooLarge"), `${name} has no request-size guard`);
    const configBlock = configText.split(`[functions.${name}]`)[1]?.split("[functions.")[0] || "";
    if (name === "game-analysis") {
      assert(/verify_jwt\s*=\s*false/.test(configBlock), "game-analysis must allow scheduled internal-service requests through the gateway");
      assert(source.includes("x-internal-service-key"), "game-analysis has no internal-service credential guard");
      assert(source.includes("internalServiceCredential === serviceRoleKey"), "game-analysis does not validate its internal-service credential");
    } else {
      assert(/verify_jwt\s*=\s*true/.test(configBlock), `${name} must verify JWTs`);
    }
  }
});
