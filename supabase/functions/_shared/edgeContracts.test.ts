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
  assertEquals(functionNames.length, 16);
});
