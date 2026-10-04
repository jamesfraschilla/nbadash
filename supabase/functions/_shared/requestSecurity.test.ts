import { assertEquals } from "jsr:@std/assert";
import { requestBodyTooLarge } from "./requestSecurity.ts";

Deno.test("request size guard rejects declared oversized bodies", () => {
  assertEquals(requestBodyTooLarge(new Request("https://example.test", { headers: { "content-length": "2097153" } })), true);
  assertEquals(requestBodyTooLarge(new Request("https://example.test", { headers: { "content-length": "100" } })), false);
});
