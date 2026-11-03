import test from "node:test";
import assert from "node:assert/strict";
import {workflowHealthIssues,pdfImportComplete,cacheIsStale,incidentFingerprint} from "./operationsHealth.js";
const now=Date.parse("2026-11-03T15:00:00Z");
const run=(date,conclusion="success")=>({head_branch:"main",status:"completed",event:"schedule",created_at:date,updated_at:date,conclusion});
test("workflow failure and missing successful heartbeat are independently visible",()=>{
  const workflow={file:"daily.yml",name:"Daily",maxAgeHours:36};
  assert.equal(workflowHealthIssues(workflow,[run("2026-11-03T10:00:00Z","failure"),run("2026-11-02T10:00:00Z")],now).length,1);
  assert.equal(workflowHealthIssues(workflow,[run("2026-11-01T00:00:00Z")],now).length,1);
  assert.equal(workflowHealthIssues(workflow,[],now).length,1);
  assert.equal(workflowHealthIssues(workflow,[run("2026-11-03T10:00:00Z"),run("2026-11-03T09:00:00Z","failure")],now).length,0);
});
test("cancelled deploys and pull requests cannot mask a production failure",()=>{
  const rows=[run("2026-11-03T12:00:00Z","cancelled"),{...run("2026-11-03T11:00:00Z"),event:"pull_request"},run("2026-11-03T10:00:00Z","failure")];
  assert.equal(workflowHealthIssues({file:"deploy.yml",name:"Deploy"},rows,now)[0].severity,"error");
});
test("PDF import requires matching fingerprint row count AND completion markers",()=>{
  assert.equal(pdfImportComplete({count:156,expectedRows:237,completeCount:156}),false);
  assert.equal(pdfImportComplete({count:237,expectedRows:237,completeCount:236}),false);
  assert.equal(pdfImportComplete({count:0,expectedRows:0,completeCount:0}),false);
  assert.equal(pdfImportComplete({count:237,expectedRows:237,completeCount:237}),true);
});
test("cache lag has a grace period but never treats missing cache metadata as healthy",()=>{
  assert.equal(cacheIsStale("2026-11-03T14:50:00Z",null,now),false);
  assert.equal(cacheIsStale("2026-11-03T14:00:00Z",null,now),true);
  assert.equal(cacheIsStale("2026-11-03T14:00:00Z","2026-11-03T14:05:00Z",now),false);
});
test("incident comparison ignores changing check times and finding order",()=>{
  const a={key:"a",severity:"error",message:"test"},b={key:"b",severity:"warning",message:"test"};
  assert.equal(incidentFingerprint([a,b]),incidentFingerprint([b,a]));
});
