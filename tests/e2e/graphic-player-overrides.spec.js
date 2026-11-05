import {test,expect} from "@playwright/test";

async function mockHeadshots(page){
  await page.route("**/functions/v1/export-image?**",route=>{
    const target=new URL(route.request().url()).searchParams.get("url")||"";
    const uploaded=target.includes("/storage/v1/object/public/graphic-headshots/");
    return route.fulfill({contentType:"image/svg+xml",body:`<svg xmlns="http://www.w3.org/2000/svg" width="${uploaded?100:260}" height="${uploaded?100:190}"><rect width="100%" height="100%" fill="${uploaded?"#00aa44":"#999999"}"/></svg>`});
  });
  await page.route("https://cdn.nba.com/headshots/**",route=>route.fulfill({contentType:"image/svg+xml",body:'<svg xmlns="http://www.w3.org/2000/svg" width="260" height="190"><rect width="100%" height="100%" fill="#999999"/></svg>'}));
}

test("player editor reports missing images, accepts numbers and uploads a replacement PNG",async({page})=>{
  await mockHeadshots(page);
  let uploads=0;
  await page.route("**/storage/v1/object/graphic-headshots/**",route=>{
    uploads++;return route.fulfill({json:{Key:"stored",Id:"test-upload"}});
  });
  await page.goto("visual-test.html");
  await page.evaluate(()=>window.renderGraphicPlayerEditorFixture());
  const trigger=page.getByRole("button",{name:"Edit Missing Player number and headshot"});
  await expect(page.locator("#player-editor-test").getByText("No photo",{exact:true})).toBeVisible();
  await expect(page.getByText("Headshot available",{exact:true})).toHaveCount(0);
  await trigger.click();
  const editor=page.getByRole("dialog");
  await editor.getByLabel("Jersey number for Missing Player").fill("00");
  expect(await page.evaluate(()=>window.graphicPlayerOverride.jerseyNum)).toBe("00");
  await editor.getByRole("button",{name:"Use roster number"}).click();
  await expect(editor.getByLabel("Jersey number for Missing Player")).toHaveValue("");
  const png=await page.evaluate(()=>{const c=document.createElement("canvas");c.width=4;c.height=4;c.getContext("2d").fillRect(0,0,4,4);return c.toDataURL("image/png").split(",")[1];});
  await editor.getByLabel("Upload headshot for Missing Player").setInputFiles({name:"headshot.png",mimeType:"image/png",buffer:Buffer.from(png,"base64")});
  await expect(editor.getByAltText("Missing Player headshot preview")).toBeVisible();
  await expect(page.locator("#player-editor-test").getByText("No photo",{exact:true})).toHaveCount(0);
  expect(uploads).toBe(1);
  expect(await page.evaluate(()=>window.graphicPlayerOverride.headshotStoragePath)).toContain("test-user/personnel/");
  await editor.getByLabel("Leave headshot blank for Missing Player").check();
  await expect(editor.getByText("Headshot hidden — exports blank")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(editor).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(editor.getByLabel("Leave headshot blank for Missing Player")).toBeChecked();
  await editor.getByRole("button",{name:"Done"}).click();
  await expect(editor).not.toBeVisible();
});

test("both exported graphics leave stock silhouette areas blank, including resolver images",async({page})=>{
  await mockHeadshots(page);
  await page.goto("visual-test.html");
  const result=await page.evaluate(async()=>{
    const m=await import("/nbadash/src/pages/matchupGraphicExport.js");
    const {renderPersonnelGraphic}=await import("/nbadash/src/pages/personnelGraphicExport.js");
    const player={personId:"999999",teamId:"1612700000",fullName:"Missing Player",familyName:"Player",jerseyNum:"00"};
    const actual=await m.loadFirstImage(m.buildPlayerHeadshotCandidates(player),{headshot:true});
    const resolver=await m.loadFirstImage(["https://example.com/resolver.png"],{headshot:true});
    const hidden={...player,headshotHidden:true};
    const match=await m.renderMatchupGraphicCanvas({leftPlayers:[player],rightPlayers:[]});
    const matchBlank=await m.renderMatchupGraphicCanvas({leftPlayers:[hidden],rightPlayers:[]});
    const options={player,stats:{ppg:1,rpg:2,apg:3,threePointPercentage:30},selectedStats:["ppg","rpg","apg","threePointPercentage"]};
    const personnel=await renderPersonnelGraphic(options);
    const personnelBlank=await renderPersonnelGraphic({...options,player:hidden});
    const same=(a,b)=>{const l=a.getContext("2d").getImageData(0,0,a.width,a.height).data;const r=b.getContext("2d").getImageData(0,0,b.width,b.height).data;return l.every((v,i)=>v===r[i]);};
    return {missing:actual===null,resolverMissing:resolver===null,matchBlank:same(match,matchBlank),personnelBlank:same(personnel,personnelBlank)};
  });
  expect(result).toEqual({missing:true,resolverMissing:true,matchBlank:true,personnelBlank:true});
});

test("matchup number overrides follow the player through a slot swap and personnel exports use the edited number",async({page})=>{
  const roster=[{personId:"80001",fullName:"Alpha Player",jerseyNum:"1",teamId:"1610612764"},
    {personId:"80002",fullName:"Beta Player",jerseyNum:"2",teamId:"1610612764"}];
  await page.route("**/rest/v1/**",route=>route.fulfill({json:[]}));
  await page.route("**/functions/v1/**",route=>{
    const path=new URL(route.request().url()).pathname;
    const data=path.endsWith("/nba-rosters")?{season:"2026-27",fetchedAt:new Date().toISOString(),teams:{"1610612764":{teamId:"1610612764",players:roster}}}
      :path.endsWith("/nba-player-stats")?{season:"2026-27",source:"nba",players:Object.fromEntries(roster.map(p=>[p.personId,{personId:p.personId,ppg:10,rpg:4,apg:3,threePointPercentage:35}]))}:{};
    return route.fulfill({json:data});
  });
  await page.route("**/api/**",route=>route.fulfill({json:[]}));
  await mockHeadshots(page);
  await page.goto("#/graphics?graphic=matchup");
  await page.getByLabel("left team",{exact:true}).selectOption("1610612764");
  await expect(page.getByLabel("left player slot 1")).toContainText("Alpha Player");
  await page.getByLabel("left player slot 1").selectOption("80001");
  await page.getByLabel("left player slot 2").selectOption("80002");
  await page.getByRole("button",{name:"Edit Alpha Player number and headshot"}).click();
  await page.getByLabel("Jersey number for Alpha Player").fill("77");
  await page.getByRole("button",{name:"Done",exact:true}).click();
  await page.getByLabel("left player slot 2").selectOption("80001");
  await expect(page.getByLabel("left player slot 1")).toHaveValue("80002");
  await expect(page.getByLabel("left player slot 2")).toHaveValue("80001");
  await expect(page.getByLabel("left player slot 2")).toContainText("#77 Alpha Player");
  await page.getByRole("button",{name:"Edit Alpha Player number and headshot"}).click();
  await expect(page.getByLabel("Jersey number for Alpha Player")).toHaveValue("77");
  await page.getByRole("button",{name:"Done",exact:true}).click();
  await page.screenshot({path:"output/graphic-player-overrides/matchup.png",fullPage:true});

  await page.goto("#/graphics?graphic=personnel");
  await page.getByLabel("NBA Team").selectOption("1610612764");
  await page.getByRole("button",{name:"Edit Alpha Player number and headshot"}).click();
  await page.getByLabel("Jersey number for Alpha Player").fill("00");
  await page.getByRole("button",{name:"Done",exact:true}).click();
  await expect(page.getByLabel("Player slot 1",{exact:true})).toContainText("#00 Alpha Player");
  await page.screenshot({path:"output/graphic-player-overrides/personnel.png",fullPage:true});
  await page.evaluate(()=>{
    Object.defineProperty(window,"showSaveFilePicker",{value:undefined,configurable:true});
    window.exportedPlayerLabels=[];
    const fillText=CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText=function(text,...rest){window.exportedPlayerLabels.push(String(text));return fillText.call(this,text,...rest);};
  });
  const download=page.waitForEvent("download");
  await page.getByRole("button",{name:"Export All",exact:true}).click();
  await download;
  expect(await page.evaluate(()=>window.exportedPlayerLabels)).toContain("#00 PLAYER");
});
