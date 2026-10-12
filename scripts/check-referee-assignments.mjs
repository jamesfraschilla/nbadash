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
      console.log(`Referee assignment scan completed at ${new Date().toISOString()}: the page had no listed crews.`);
      process.exit(0);
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
