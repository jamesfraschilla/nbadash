// Only GitHub issue writes. Never mutates NBA data, user notes, or deployments.
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {MONITORED_WORKFLOWS,workflowHealthIssues,incidentFingerprint} from "../src/operationsHealth.js";
const repo=process.env.GITHUB_REPOSITORY || "jamesfraschilla/nbadash";
const token=process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if(!token)throw Error("GitHub issue credential missing");
async function api(path,method="GET",body) {
  const response=await fetch(`https://api.github.com/repos/${repo}/${path}`,{
    method,headers:{Authorization:`Bearer ${token}`,Accept:"application/vnd.github+json","Content-Type":"application/json"},
    ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000),
  });
  if(!response.ok)throw Error(`GitHub ${method} ${path}: HTTP ${response.status}`);
  return response.status===204?null:response.json();
}
let key="health",title="[Operations] Dashboard health needs attention",report;
const postgame=process.argv.includes("--postgame");
const feedContract=process.argv.includes("--feed-contract");
if(postgame){key="postgame";title="[Operations] Postgame accuracy review";}
if(feedContract){key="feed-contract";title="[Operations] NBA feed degradation and schema review";}
if(process.argv.includes("--workflow-event")) {
  const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
  const run=event.workflow_run;
  if(run?.head_branch!=="main")process.exit(0);
  const workflow=MONITORED_WORKFLOWS.find(w=>w.name===run.name);
  if(!workflow)process.exit(0);
  const current=await api(`actions/workflows/${workflow.file}/runs?branch=main&per_page=30`);
  key=`workflow:${workflow.file}`;title=`[Operations] ${workflow.name}`;
  report={checkedAt:new Date().toISOString(),findings:workflowHealthIssues({...workflow,maxAgeHours:undefined},current.workflow_runs || [])};
} else {
  try { report=JSON.parse(await readFile(feedContract?"output/nba-feed-contract/latest.json":`output/operations-health/${postgame?"postgame":"latest"}.json`,"utf8")); }
  catch { report={checkedAt:new Date().toISOString(),findings:[{key:"monitor-did-not-complete",severity:"error",message:"Operations monitor did not produce its report. Inspect the monitoring workflow."}]}; }
}
const marker=`<!-- nbadash-operations:${key} -->`;
let existing;
for(let page=1;page<=5&&!existing;page++) {
  const issues=await api(`issues?state=all&per_page=100&page=${page}&sort=created&direction=desc`);
  existing=issues.find(issue=>!issue.pull_request && issue.body?.includes(marker));
  if(issues.length<100)break;
}
const findings=report.findings || [];
const hash=createHash("sha256").update(incidentFingerprint(findings)).digest("hex");
const fingerprint=`<!-- findings:${hash} -->`;
const runUrl=process.env.GITHUB_RUN_ID?`https://github.com/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`:"";
if(!findings.length) {
  if(existing?.state==="open") {
    await api(`issues/${existing.number}/comments`,"POST",{body:`Checks are healthy again. ${runUrl?`[Verification run](${runUrl})`:"Verified by the operations checker."}`});
    await api(`issues/${existing.number}`,"PATCH",{state:"closed",state_reason:"completed"});
    console.log(`Closed resolved operations issue #${existing.number}`);
  } else console.log("No operations incident to open.");
} else {
  const body=[marker,fingerprint,`Last material change verified: ${report.checkedAt}`,"",
    ...findings.map(f=>`- **${f.severity.toUpperCase()}** ${f.message}${f.url?` [Details](${f.url})`:""}`),"",
    "This issue is persistent until checks clear. Automated retry is not a human review. Do not infer whistling officials or overwrite manual decisions to make checks green.",
    runUrl?`[Monitor report and artifacts](${runUrl})`:"", "",
    "Owner: repository maintainer. Statistical source conflicts require source-backed investigation; code fixes and production data repairs require verification before deployment.",
  ].join("\n");
  if(!existing) {
    const owner=repo.split("/")[0];
    const issue=await api("issues","POST",{title,body,assignees:[owner]});
    console.log(`Opened assigned operations issue #${issue.number}: ${issue.html_url}`);
  } else if(existing.state!=="open" || !existing.body.includes(fingerprint)) {
    await api(`issues/${existing.number}`,"PATCH",{title,body,state:"open"});
    await api(`issues/${existing.number}/comments`,"POST",{body:`Findings changed; see the updated checklist above. ${runUrl?`[Verification run](${runUrl})`:""}`});
    console.log(`Updated operations issue #${existing.number}`);
  } else console.log(`Unchanged findings; no duplicate notification for #${existing.number}`);
}
