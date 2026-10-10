import { assertEquals } from "jsr:@std/assert@1";
import { parseRefereeAssignments } from "./parser.ts";

Deno.test("parses the official NBA referee assignment table", () => {
  const html = `
    <table><tbody><tr>
      <td>Washington @ New York</td>
      <td><a href="#">Marc Davis (#8)</a></td>
      <td><a href="#">Ray Acosta (#54)</a></td>
      <td><a href="#">Suyash Mehta (#47)</a></td>
      <td></td>
    </tr></tbody></table>`;

  assertEquals(parseRefereeAssignments(html), [{
    game: "Washington @ New York",
    crewChief: "Marc Davis",
    crewChiefNumber: "8",
    referee: "Ray Acosta",
    refereeNumber: "54",
    umpire: "Suyash Mehta",
    umpireNumber: "47",
    alternate: "",
    alternateNumber: "",
  }]);
});
