import { expect, test } from "@playwright/test";

test("enlarged Biniam editor preview renders the same crop as exports", async ({ page }) => {
  await page.goto("visual-test.html");
  const result = await page.evaluate(async () => {
    const { default: React } = await import("/nbadash/node_modules/.vite/deps/react.js");
    const { default: ReactDOM } = await import("/nbadash/node_modules/.vite/deps/react-dom_client.js");
    const { default: Preview } = await import("/nbadash/src/components/RefereeHeadshotPreview.jsx");
    const { buildCanvasAvatarPlacement } = await import("/nbadash/src/refereeHeadshots.js");
    const src = "/nbadash/src/assets/referees/Biniam%20Maru.jpg";
    const image = new Image();
    image.src = src;
    await image.decode();
    document.body.replaceChildren();
    const host = document.createElement("div");
    host.style.cssText = "width:252px;height:252px;margin:40px;overflow:hidden;border-radius:18px";
    document.body.append(host);
    const override = { scale: 1.51, scaleY: 0.96, offsetY: 80 };
    ReactDOM.createRoot(host).render(React.createElement(Preview, { src, name: "Biniam Maru", override, size: 252 }));
    // Wait for React's image effect, not just the component mount.
    let actual;
    for (let attempt = 0; attempt < 100; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      actual = host.querySelector("canvas");
      if (actual && actual.getContext("2d").getImageData(126, 126, 1, 1).data[0] !== 255) break;
    }
    const expected = document.createElement("canvas");
    expected.width = expected.height = 252;
    const context = expected.getContext("2d");
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, 252, 252);
    const p = buildCanvasAvatarPlacement({ sourceWidth: image.naturalWidth, sourceHeight: image.naturalHeight,
      targetX: 0, targetY: 0, targetSize: 252, override, variant: "landscape" });
    context.drawImage(image, p.drawX, p.drawY, p.drawWidth, p.drawHeight);
    const a = actual.getContext("2d").getImageData(0, 0, 252, 252).data;
    const b = context.getImageData(0, 0, 252, 252).data;
    const background = Array.from(actual.getContext("2d").getImageData(126, 2, 1, 1).data);
    return { mismatches: a.reduce((n, value, i) => n + Number(value !== b[i]), 0), width: actual.width, background };
  });
  expect(result).toEqual({ mismatches: 0, width: 252, background: [255, 255, 255, 255] });
  await page.screenshot({ path: test.info().outputPath("biniam-crop.png") });
});
