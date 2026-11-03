import test from "node:test";
import assert from "node:assert/strict";
import { classifyShotZone } from "../supabase/functions/_shared/shotZone.ts";
test("shared shot zones treat the five-foot boundary consistently and never invent a missing distance", () => {
  for (const value of [0, 4, 4.9, 4.99, "4.99"]) assert.equal(classifyShotZone({actionType:"2pt",shotDistance:value}),"rim");
  for (const value of [5, 5.1, 20]) assert.equal(classifyShotZone({actionType:"2pt",shotDistance:value}),"mid");
  for (const value of [null, undefined, "", " ", -1, "bad"]) assert.equal(classifyShotZone({actionType:"2pt",shotDistance:value}),"unknown");
  assert.equal(classifyShotZone({actionType:"3pt"}),"three");
});
