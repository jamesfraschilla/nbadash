const baseUrl = String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
if (!baseUrl) throw new Error("VITE_SUPABASE_URL or SUPABASE_URL is required.");

const endpoint = `${baseUrl}/functions/v1/referee-assignments?refresh=1`;
const attempts = 3;

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(20_000),
    });
    const payload = await response.json().catch(() => ({}));

    if (response.status === 502 && payload?.error === "The NBA assignments page returned no crews.") {
      const diagnostic = payload?.diagnostic || {};
      if (Number(diagnostic.htmlLength) >= 1000
        && Number(diagnostic.tableCount) > 0
        && Number(diagnostic.assignmentShapedRowCount) === 0) {
        console.log(`Referee assignment scan completed at ${new Date().toISOString()}: the NBA page is intact but has no listed crews today.`);
        process.exit(0);
      }
      throw new Error(`Assignment parser found no crews in a page with assignment-shaped rows (HTML ${diagnostic.htmlLength || 0} chars, ${diagnostic.tableCount || 0} tables, ${diagnostic.tableRowCount || 0} rows, ${diagnostic.assignmentShapedRowCount || 0} assignment-shaped rows).`);
    }
    if (!response.ok) throw new Error(payload?.error || `Assignment endpoint returned HTTP ${response.status}.`);

    const assignments = Array.isArray(payload?.assignments) ? payload.assignments : [];
    console.log(`Referee assignment scan completed at ${payload?.fetchedAt || new Date().toISOString()}: ${assignments.length} crew(s).`);
    assignments.forEach((assignment) => {
      console.log(`${assignment.game}: ${assignment.crewChief}, ${assignment.referee}, ${assignment.umpire}${assignment.alternate ? ` (alternate: ${assignment.alternate})` : ""}`);
    });
    process.exit(0);
  } catch (error) {
    if (attempt === attempts) throw error;
    console.warn(`Assignment scan attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}; retrying in 60 seconds.`);
    await new Promise((resolve) => setTimeout(resolve, 60_000));
  }
}
