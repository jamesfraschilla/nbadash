type RecordValue = Record<string, any>;

const normalize = (value: unknown) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[’‘]/g, "'").replace(/[–—]/g, "-").toLowerCase();
const strings = (value: unknown): string[] => typeof value === "string" ? [value]
  : Array.isArray(value) ? value.flatMap(strings)
  : value && typeof value === "object" ? Object.values(value).flatMap(strings) : [];

export function invalidScoringDirectionClaims(analysis: RecordValue): string[] {
  const reasons: string[] = [];
  for (const text of strings({ headline: analysis.headline, summary: analysis.summary, sections: analysis.sections })) {
    // A valid numeric pair is still wrong when its verb reverses the result.
    // Do not match passive "was outscored" (the subject lost that span).
    const normalized = normalize(text);
    const pattern = /\b(outscored|outscoring|outscore)\b[^.!?;\d]{0,75}?(\d{1,3})\s*-\s*(\d{1,3})\b/g;
    for (const match of normalized.matchAll(pattern)) {
      if (/\b(?:was|were|been|being|got)\s+$/.test(normalized.slice(0, match.index))) continue;
      if (Number(match[2]) <= Number(match[3])) reasons.push(`outscored claim contradicts score ${match[2]}-${match[3]}`);
    }
  }
  return [...new Set(reasons)];
}

// Validate explicit ENDING margins against the actual game score, never the
// selected quarter's scoring differential. Peak/run margins are different facts.
export function invalidEndingMargins(analysis: RecordValue, features: RecordValue): string[] {
  if (!features.score?.end) return [];
  const expected = Math.abs(Number(features.score.end.home) - Number(features.score.end.away));
  const endPeriod = Number(/^Q(\d+)/.exec(features.range?.endLabel || "")?.[1] || 0);
  const reasons: string[] = [];
  const patterns = [
    /\b(?:finish(?:ed|ing)?|end(?:ed|ing)?)\s+(?:(?:the|this|that)\s+)?(?:(?:selected\s+)?(?:quarter|half|period|game|span|stretch)\s+)?(?:ahead|up|down|behind|trailing|leading)\s+(?:by\s+)?(?:(?:just|only)\s+)?(\d+)(?!\d|\.\d|\s*[-:]\s*\d)\b/gi,
    /\b(\d+)[- ]point\s+(?:lead|deficit|advantage|cushion)\s+(?:by|at|entering|heading into)\s+(?:the\s+)?(?:half(?:time)?|quarter's end|end of (?:the )?(?:quarter|half|game|span|stretch))\b/gi,
    /\b(?:ahead|up|down|behind|trailing|leading|led)\s+(?:by\s+)?(\d+)\s*(?:pts|points)?\s+(?:at|by)\s+(?:the\s+)?(?:half(?:time)?|quarter's end|end of (?:the )?(?:quarter|half|game|span|stretch))\b/gi,
    /\b(\d+)[- ]point\s+(?:lead|deficit|advantage|cushion)\s+(?:entering|heading into)\s+(?:the\s+)?(?:fourth|third|second|next|final)\s+quarter\b/gi,
  ];
  for (const text of strings({ headline: analysis.headline, summary: analysis.summary, sections: analysis.sections })) {
    for (const pattern of patterns) {
      for (const match of normalize(text).matchAll(pattern)) {
        if (endPeriod && endPeriod !== 2 && /(?:by|at) (?:the )?half(?:time)?\b/.test(match[0])) continue;
        if (Number(match[1]) !== expected) reasons.push(`ending margin ${match[1]} does not match actual game margin ${expected}`);
      }
    }
    for (const [side, other] of [["home", "away"], ["away", "home"]]) {
      const team = features.teams?.[side] || {};
      const aliases = [team.name, team.city, team.tricode].filter(Boolean)
        .map((name) => normalize(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      if (!aliases.length) continue;
      const pattern = new RegExp(`\\b(?:${aliases.join("|")})\\s+(?:finished|ended|finish|end)\\s+(?:the\\s+)?(?:(?:selected\\s+)?(?:quarter|half|game|span|stretch)\\s+)?(ahead|up|down|behind|trailing|leading)\\s+(?:by\\s+)?(\\d+)(?!\\d|\\.\\d|\\s*[-:]\\s*\\d)\\b`, "g");
      const signedMargin = Number(features.score.end[side]) - Number(features.score.end[other]);
      for (const match of normalize(text).matchAll(pattern)) {
        const claimed = Number(match[2]) * (/down|behind|trailing/.test(match[1]) ? -1 : 1);
        if (claimed !== signedMargin) reasons.push(`${team.tricode || team.name} ending lead/deficit does not match signed game margin ${signedMargin}`);
      }
    }
  }
  return [...new Set(reasons)];
}

// Starting and ending margins are different facts. Restrict this guard to
// explicit opening language or an opening-sized lead/deficit reversal in the
// subject's span description; a separately described mid-span run is excluded.
export function invalidOpeningMargins(analysis: RecordValue, features: RecordValue): string[] {
  if (!features.score?.start || !features.teams) return [];
  const reasons: string[] = [];
  const numbers: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
  for (const text of strings({headline:analysis.headline,summary:analysis.summary,sections:analysis.sections})) {
    for (const sentence of normalize(text).split(/(?<=[.!?])\s+/)) {
      const mentions = ["home","away"].map(side => {
        const team = features.teams[side] || {};
        const indices = [team.name,team.city,team.tricode].filter(Boolean).flatMap(alias => {
          const expression = new RegExp(`\\b${normalize(alias).replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\b`);
          const match = expression.exec(sentence); return match ? [match.index] : [];
        });
        return {side, index:Math.min(Infinity,...indices)};
      }).sort((a,b)=>a.index-b.index);
      if (!Number.isFinite(mentions[0]?.index) || mentions[0].index === mentions[1]?.index) continue;
      const side = mentions[0].side, other = side === "home" ? "away" : "home";
      const expected = Number(features.score.start[side]) - Number(features.score.start[other]);
      const pattern = /\b(turning|erasing|overcoming|starting with|began with|entering[^,.!?]{0,25}?with)\s+(?:a|an|the|its)?\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)[- ]point\s+(lead|deficit)\b/g;
      for (const match of sentence.matchAll(pattern)) {
        if (/\b(?:run|push|burst)\b/.test(sentence.slice(0,match.index))) continue;
        const magnitude = numbers[match[2]] ?? Number(match[2]);
        const claimed = magnitude * (match[3] === "deficit" ? -1 : 1);
        if ((/starting|began|entering/.test(match[1]) || magnitude === Math.abs(expected)) && claimed !== expected) {
          reasons.push(`${features.teams[side].tricode} opening lead/deficit ${claimed} does not match ${expected}`);
        }
      }
    }
  }
  return [...new Set(reasons)];
}

export function invalidLargestRunClaims(analysis: RecordValue, features: RecordValue): string[] {
  const reasons: string[] = [];
  for (const side of ["home", "away"]) {
    const team = features.teams?.[side] || {};
    const expected = Number(team.largestRun?.points);
    if (!Number.isFinite(expected)) continue;
    const aliases = [team.name, team.city, team.tricode].filter(Boolean)
      .map(name => normalize(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (!aliases.length) continue;
    const owner = `\\b(?:${aliases.join("|")})(?:'s)?`;
    const patterns = [
      new RegExp(`${owner}[^.!?]{0,35}?\\b(?:largest|biggest|longest)\\s+(?:unanswered\\s+)?run\\s+(?:(?:was|of|at|a|an|the)\\s+)*(\\d+)\\s*-\\s*0\\b`,"g"),
      new RegExp(`${owner}[^.!?;]{0,15}?\\b(\\d+)\\s*-\\s*0\\s+run[^.!?;]{0,100}\\b(?:their|its|the)\\s+(?:largest|biggest|longest)\\s+run\\b`,"g"),
    ];
    for (const text of strings({headline:analysis.headline,summary:analysis.summary,sections:analysis.sections})) {
      for (const pattern of patterns) for (const match of normalize(text).matchAll(pattern)) {
        if (Number(match[1]) !== expected) reasons.push(`${team.tricode} largest run ${match[1]}-0 should be ${expected}-0`);
      }
    }
  }
  return [...new Set(reasons)];
}

export function invalidPlayerClaims(analysis: RecordValue, features: RecordValue): string[] {
  const players: RecordValue[] = features.players || [];
  const reasons: string[] = [];
  const teamNames = Object.values(features.teams || {}).flatMap((team: any) => [team.name, team.city, team.tricode])
    .filter(Boolean).map((name) => normalize(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const nextTeamSubject = teamNames.length
    ? new RegExp(`\\b(?:the\\s+)?(?:${teamNames.join("|")})\\s+(?:shot|shooting|made|making|hit|hitting|converted|converting|struggled|struggling|finished|finishing|went|going|were|was)\\b`) : null;
  const aliases = players.map((player) => {
    const name = normalize(player.name);
    const parts = name.split(/\s+/).filter(Boolean);
    const surname = parts.at(-1) || "";
    return { player, aliases: [name, surname].filter((alias) => alias.length > 2) };
  });
  for (const text of strings({ headline: analysis.headline, summary: analysis.summary, sections: analysis.sections })) {
    for (const sentence of normalize(text).split(/(?<=[.!?])\s+(?=[a-z])/)) {
      const mentions = aliases.flatMap(({ player, aliases: names }) => {
        const matches = names.flatMap((name) => {
          const index = sentence.indexOf(name);
          if (index < 0 || /[a-z]/.test(sentence[index - 1] || "") || /[a-z]/.test(sentence[index + name.length] || "")) return [];
          // An ambiguous shared surname is not enough to attribute a statistic.
          if (names.length > 1 && name === names[1] && aliases.filter((entry) => entry.aliases.includes(name)).length > 1) return [];
          return [{ index, length: name.length }];
        }).sort((a, b) => a.index - b.index || b.length - a.length);
        return matches.length ? [{ player, ...matches[0] }] : [];
      }).sort((a, b) => a.index - b.index);
      mentions.forEach(({ player, index, length }, mentionIndex) => {
        const roleContext = sentence.slice(Math.max(0, index - 35), index + length + 45);
        if (/\b(?:bench standout|bench scorer|off the bench|bench production)\b/.test(roleContext)
          && player.isStarter !== false) {
          reasons.push(`${player.name} bench role is not verified by the supplied data`);
        }
        let clause = sentence.slice(index + length, mentions[mentionIndex + 1]?.index);
        // A subsequent explicit team shooting statement starts a new subject.
        if (nextTeamSubject) clause = clause.split(nextTeamSubject)[0];
        const leader = /^.{0,25}?\b(?:led|leads|leading)\s+all\s+scorers\b/.test(clause);
        const highestPoints = Math.max(...players.map((entry) => Number(entry.points) || 0));
        if (leader && Number(player.points) < highestPoints) {
          reasons.push(`${player.name} cannot lead all scorers with ${player.points}; the scoring leader has ${highestPoints}`);
        }
        const points = /^.{0,45}?\b(?:scored|had|contributed|with|led with)\s+(\d+)\s+(?:pts|points)\b/.exec(clause);
        if (points && Number(points[1]) !== Number(player.points)) reasons.push(`${player.name} scoring claim ${points[1]} does not match ${player.points}`);
        const fractions = [...clause.matchAll(/(\d+(?:\.\d+)?)%\s*\((\d+)\/(\d+)\)/g)];
        fractions.forEach((match, i) => {
          const previousEnd = i ? fractions[i - 1].index! + fractions[i - 1][0].length : 0;
          const before = clause.slice(Math.max(previousEnd, match.index! - 65), match.index);
          const after = clause.slice(match.index! + match[0].length, Math.min(fractions[i + 1]?.index ?? clause.length, match.index! + match[0].length + 45));
          const context = `${before} ${after}`;
          const key = /three|3-?point|from deep|beyond the arc/.test(context) ? "threePointers"
            : /free.throw|at the line/.test(context) ? "freeThrows"
            : /overall|from the field|field.goal/.test(context) ? "fieldGoals" : null;
          if (!key) return;
          const made = Number(player[`${key}Made`]);
          const attempted = Number(player[`${key}Attempted`]);
          if (Number(match[2]) !== made || Number(match[3]) !== attempted
            || Math.abs(Number(match[1]) - (attempted ? made / attempted * 100 : 0)) > 0.15) {
            reasons.push(`${player.name} ${key} claim ${match[2]}/${match[3]} does not match ${made}/${attempted}`);
          }
        });
      });
    }
  }
  return [...new Set(reasons)];
}
