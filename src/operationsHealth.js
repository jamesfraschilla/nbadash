export const MONITORED_WORKFLOWS = [
  { file:"officiating-daily-maintenance.yml", name:"Officiating Daily Maintenance", maxAgeHours:36 },
  { file:"officiating-nightly-ingestion.yml", name:"Officiating Nightly Ingestion", maxAgeHours:36 },
  { file:"referee-assignment-scan.yml", name:"Scan Referee Assignments", maxAgeHours:36 },
  { file:"update-rosters.yml", name:"Update Rosters", maxAgeHours:36 },
  { file:"capture-period-snapshots.yml", name:"Capture Period Snapshots", maxAgeHours:4 },
  { file:"deploy-supabase.yml", name:"Deploy Supabase" },
  { file:"deploy.yml", name:"Deploy to GitHub Pages" },
];

export function workflowHealthIssues(workflow, runs, now = Date.now()) {
  const relevant = runs.filter(run=>run.head_branch==="main" && run.event!=="pull_request")
    .sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
  const latest = relevant.find(run=>run.status==="completed" && run.conclusion!=="cancelled");
  const issues=[];
  if (latest && latest.conclusion!=="success") issues.push({key:`workflow:${workflow.file}`,severity:"error",
    message:`${workflow.name}: latest completed run ${latest.conclusion}.`,url:latest.html_url});
  const success = relevant.find(run=>run.conclusion==="success");
  if (workflow.maxAgeHours && (!success || now-Date.parse(success.updated_at || success.created_at)>workflow.maxAgeHours*3600000)) {
    issues.push({key:`heartbeat:${workflow.file}`,severity:"error",message:`${workflow.name}: no successful run within ${workflow.maxAgeHours} hours.`,url:latest?.html_url});
  }
  return issues;
}

export function pdfImportComplete({count,expectedRows,completeCount}) {
  return Number(expectedRows)>0 && count===Number(expectedRows) && completeCount===count;
}

export function cacheIsStale(sourceTime, cacheTime, now=Date.now(), graceMs=30*60000) {
  const source=Date.parse(sourceTime || ""), cache=Date.parse(cacheTime || "");
  return Number.isFinite(source) && (!Number.isFinite(cache) || source>cache) && now-source>graceMs;
}

export function incidentFingerprint(findings) {
  return JSON.stringify(findings.map(({key,severity,message})=>({key,severity,message})).sort((a,b)=>a.key.localeCompare(b.key)));
}
