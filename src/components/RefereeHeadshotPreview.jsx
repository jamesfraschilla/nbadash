import { useEffect, useRef } from "react";
import { buildCanvasAvatarPlacement } from "../refereeHeadshots.js";

// Use the export geometry instead of a separate CSS object-fit/transform path.
export default function RefereeHeadshotPreview({ src, name, override, size = 84 }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    let active = true;
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, size, size);
    const image = new Image();
    image.onload = () => {
      if (!active) return;
      const { drawX, drawY, drawWidth, drawHeight } = buildCanvasAvatarPlacement({
        sourceWidth: image.naturalWidth, sourceHeight: image.naturalHeight,
        targetX: 0, targetY: 0, targetSize: size, override,
      });
      context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    };
    image.src = src;
    return () => { active = false; };
  }, [src, override, size]);
  return <canvas ref={canvasRef} width={size} height={size} role="img" aria-label={name} style={{ display: "block", width: "100%", height: "100%" }} />;
}
