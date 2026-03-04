import { useMemo, useRef, useState } from "react";
import styles from "./OfficialsExportPanel.module.css";

const IMAGE_MODULES = import.meta.glob(
  [
    "../assets/referees/*.jpg",
    "../assets/referees/*.jpeg",
    "../assets/referees/*.JPG",
    "../assets/referees/*.JPEG",
  ],
  { eager: true, import: "default" }
);

const ROLE_ORDER = {
  crewChief: 0,
  referee: 1,
  umpire: 2,
};

const EXPORT_SPECS = {
  portrait: {
    label: "Portrait",
    logicalWidth: 384,
    logicalHeight: 648,
    outputWidth: 1536,
    outputHeight: 2592,
  },
  landscape: {
    label: "Landscape",
    logicalWidth: 660,
    logicalHeight: 510,
    outputWidth: 3300,
    outputHeight: 2550,
  },
  was: {
    label: "WAS",
    outputWidth: 3840,
    outputHeight: 2160,
    boxX: 0,
    boxY: 0,
    boxWidth: 802,
    boxHeight: 1300,
  },
};

const refereeHeadshotMap = Object.entries(IMAGE_MODULES).reduce((map, [path, url]) => {
  const fileName = path.split("/").pop() || "";
  const baseName = fileName.replace(/\.(jpe?g)$/i, "");
  map.set(normalizeNameKey(baseName), url);
  return map;
}, new Map());

const imageDataUrlCache = new Map();

function normalizeNameKey(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();
}

function readOfficialName(official) {
  const first = String(official?.firstName || "").trim();
  const last = String(official?.familyName || "").trim();
  const combined = `${first} ${last}`.trim();
  if (combined) return combined;
  return String(
    official?.name ||
    official?.fullName ||
    official?.displayName ||
    official?.officialName ||
    ""
  ).trim();
}

function splitOfficialName(official) {
  const explicitFirst = String(official?.firstName || "").trim();
  const explicitLast = String(official?.familyName || "").trim();
  if (explicitFirst || explicitLast) {
    const fallback = `${explicitFirst} ${explicitLast}`.trim();
    return {
      firstName: explicitFirst || fallback,
      lastName: explicitLast || fallback,
      fullName: fallback,
    };
  }

  const fullName = readOfficialName(official);
  const parts = fullName.split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { firstName: "", lastName: "", fullName: "" };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: parts[0], fullName };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
    fullName,
  };
}

function normalizeRole(rawValue) {
  const raw = String(rawValue || "").trim();
  const compact = raw.replace(/[^a-z]/gi, "").toLowerCase();
  if (!compact) return "referee";
  if (compact.includes("alternate")) return "alternate";
  if (compact === "crewchief" || (compact.includes("crew") && compact.includes("chief"))) {
    return "crewChief";
  }
  if (compact.includes("umpire")) return "umpire";
  if (compact.includes("referee")) return "referee";
  return "referee";
}

function normalizeOfficial(official, index) {
  const nameParts = splitOfficialName(official);
  const fullName = nameParts.fullName || `${nameParts.firstName} ${nameParts.lastName}`.trim();
  const role = normalizeRole(
    official?.assignment ||
    official?.role ||
    official?.title ||
    official?.position ||
    official?.officialRole ||
    official?.roleName
  );
  const isAlternate = Boolean(official?.isAlternate || official?.alternate) || role === "alternate";
  const jerseyNumber = String(
    official?.jerseyNum ??
    official?.jerseyNumber ??
    official?.number ??
    official?.shirtNumber ??
    ""
  ).trim();
  const headshotUrl = refereeHeadshotMap.get(normalizeNameKey(fullName)) || null;

  return {
    id: official?.personId || official?.officialId || `${fullName || "official"}-${index}`,
    firstName: nameParts.firstName,
    lastName: nameParts.lastName,
    fullName,
    firstUpper: nameParts.firstName.toUpperCase(),
    lastUpper: nameParts.lastName.toUpperCase(),
    jerseyNumber,
    role,
    isAlternate,
    headshotUrl,
  };
}

function buildOfficialsData(officials) {
  const normalized = Array.isArray(officials)
    ? officials.map((official, index) => normalizeOfficial(official, index))
    : [];

  const primary = normalized
    .filter((official) => !official.isAlternate)
    .sort((a, b) => {
      const aOrder = ROLE_ORDER[a.role] ?? 99;
      const bOrder = ROLE_ORDER[b.role] ?? 99;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.fullName.localeCompare(b.fullName);
    });

  const alternates = normalized
    .filter((official) => official.isAlternate)
    .map((official) => official.fullName)
    .filter(Boolean);

  return { primary, alternates };
}

function getInitials(fullName) {
  const parts = String(fullName || "").split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
}

function getThemeMode() {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function waitForFrame() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(resolve);
    });
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function assetUrlToDataUrl(url) {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  if (imageDataUrlCache.has(url)) return imageDataUrlCache.get(url);
  const promise = fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load asset: ${response.status}`);
      }
      return response.blob();
    })
    .then(blobToDataUrl)
    .catch(() => null);
  imageDataUrlCache.set(url, promise);
  return promise;
}

async function inlineImages(cloneRoot) {
  const images = Array.from(cloneRoot.querySelectorAll("img"));
  await Promise.all(
    images.map(async (image) => {
      const currentSrc = image.getAttribute("src") || "";
      const dataUrl = await assetUrlToDataUrl(currentSrc);
      if (dataUrl) {
        image.setAttribute("src", dataUrl);
      } else {
        image.remove();
      }
    })
  );
}

async function renderNodeToCanvas(node, width, height) {
  if (!node) {
    throw new Error("Missing export template.");
  }

  const clone = node.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  await inlineImages(clone);

  const markup = clone.outerHTML;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <foreignObject x="0" y="0" width="100%" height="100%">${markup}</foreignObject>
    </svg>
  `;
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawContain(context, source, targetX, targetY, targetWidth, targetHeight) {
  const width = source.width || source.naturalWidth;
  const height = source.height || source.naturalHeight;
  const scale = Math.min(targetWidth / width, targetHeight / height);
  const drawWidth = width * scale;
  const drawHeight = height * scale;
  const x = targetX + (targetWidth - drawWidth) / 2;
  const y = targetY + (targetHeight - drawHeight) / 2;
  context.drawImage(source, x, y, drawWidth, drawHeight);
}

function makeOutputCanvas(width, height, background) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  return { canvas, context };
}

function downloadCanvas(canvas, fileName) {
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = fileName;
  link.click();
}

function getTextColors(themeMode) {
  const dark = themeMode === "dark";
  return {
    background: dark ? "#000000" : "#ffffff",
    text: dark ? "#ffffff" : "#000000",
    mutedText: dark ? "#ffffff" : "#000000",
    fallbackBox: "#E8E8E8",
    fallbackText: "#000000",
  };
}

function getPortraitNameText(official) {
  const prefix = official.jerseyNumber ? `#${official.jerseyNumber} ` : "";
  return `${prefix}${official.firstUpper} ${official.lastUpper}`.trim();
}

function fitFontSize(text, baseSize, maxChars) {
  const count = String(text || "").length;
  if (!count || count <= maxChars) return baseSize;
  const scale = Math.max(0.68, maxChars / count);
  return Number((baseSize * scale).toFixed(2));
}

function getAvatarImageStyle(official, variant) {
  if (official.fullName !== "Eric Lewis") {
    return {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      objectPosition: "center top",
      display: "block",
    };
  }

  const shift = variant === "landscape" ? 8.5 : 6;
  return {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: "center top",
    display: "block",
    transform: `translateY(${shift}px) scale(1.12)`,
    transformOrigin: "center top",
  };
}

function renderAvatar(official, size, radius, variant) {
  const frameStyle = {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: `${radius}px`,
    overflow: "hidden",
    background: "#E8E8E8",
    flexShrink: 0,
    position: "relative",
  };

  const fallback = (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#000000",
        fontFamily: "\"DINalt\", \"Roboto Condensed\", sans-serif",
        fontWeight: 700,
        fontSize: `${Math.max(18, size * 0.28)}px`,
        lineHeight: 1,
      }}
    >
      {getInitials(official.fullName)}
    </div>
  );

  if (official.headshotUrl) {
    return (
      <div style={frameStyle}>
        {fallback}
        <img
          alt=""
          src={official.headshotUrl}
          style={getAvatarImageStyle(official, variant)}
        />
      </div>
    );
  }

  return <div style={frameStyle}>{fallback}</div>;
}

function ExportTemplate({ variant, primaryOfficials, alternates, themeMode }) {
  const colors = getTextColors(themeMode);
  const isPortrait = variant === "portrait";
  const width = isPortrait ? 384 : 660;
  const height = isPortrait ? 648 : 510;

  return (
    <div
      style={{
        width: `${width}px`,
        height: `${height}px`,
        padding: isPortrait ? "24px 24px 18px" : "12px 22px 18px",
        background: colors.background,
        color: colors.text,
        display: "flex",
        flexDirection: "column",
        justifyContent: isPortrait ? "flex-start" : "stretch",
        textDecoration: "none",
        fontFamily: "\"DINalt\", \"Roboto Condensed\", sans-serif",
      }}
    >
      {isPortrait ? (
        <>
          <div
            style={{
              textAlign: "center",
              fontFamily: "\"DIN\", \"Roboto Condensed\", sans-serif",
              fontWeight: 700,
              fontSize: "28.8px",
              lineHeight: 1,
              textDecoration: "none",
            }}
          >
            TONIGHT&apos;S OFFICIALS
          </div>
          <div style={{ height: "10px", flexShrink: 0 }} />
          {primaryOfficials.length ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: "18px", flexShrink: 0 }}>
                {primaryOfficials.map((official) => {
                  const nameLine = getPortraitNameText(official);
                  return (
                    <div
                      key={`${variant}-${official.id}`}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        textAlign: "center",
                        textDecoration: "none",
                      }}
                    >
                      {renderAvatar(official, 120, 18, variant)}
                      <div style={{ height: "8px", flexShrink: 0 }} />
                      <div
                        style={{
                          width: "100%",
                          fontFamily: "\"DINalt\", \"Roboto Condensed\", sans-serif",
                          fontWeight: 700,
                          fontSize: `${fitFontSize(nameLine, 23, 18)}px`,
                          lineHeight: 0.95,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textDecoration: "none",
                        }}
                      >
                        {nameLine}
                      </div>
                      {official.role === "crewChief" ? (
                        <div
                          style={{
                            marginTop: "2px",
                            fontFamily: "\"DINalt\", \"Roboto Condensed\", sans-serif",
                            fontWeight: 600,
                            fontSize: "11px",
                            lineHeight: 1,
                            textDecoration: "none",
                          }}
                        >
                          Crew Chief
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div style={{ flex: 1 }} />
            </>
          ) : (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                fontSize: "18px",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Officials not posted.
            </div>
          )}
          {alternates.length ? (
            <div
              style={{
                paddingTop: "6px",
                fontFamily: "\"DINalt\", \"Roboto Condensed\", sans-serif",
                fontWeight: 600,
                fontSize: "10px",
                lineHeight: 1,
                textAlign: "center",
                textDecoration: "none",
              }}
            >
              {`Alternate: ${alternates.join(", ")}`}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div style={{ flex: 3 }} />
          <div
            style={{
              textAlign: "center",
              fontFamily: "\"DIN\", \"Roboto Condensed\", sans-serif",
              fontWeight: 700,
              fontSize: "50px",
              lineHeight: 1,
              textDecoration: "none",
            }}
          >
            TONIGHT&apos;S OFFICIALS
          </div>
          <div style={{ height: "12px", flexShrink: 0 }} />
          {primaryOfficials.length ? (
            <>
              <div
                style={{
                  height: "360px",
                  display: "grid",
                  gridTemplateColumns: `repeat(${Math.max(primaryOfficials.length, 1)}, minmax(0, 1fr))`,
                  gap: "12px",
                  alignItems: "start",
                  flexShrink: 0,
                }}
              >
                {primaryOfficials.map((official) => {
                  const lineOne = `${official.jerseyNumber ? `#${official.jerseyNumber} ` : ""}${official.firstUpper}`.trim();
                  const lineTwo = official.lastUpper;
                  return (
                    <div
                      key={`${variant}-${official.id}`}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        textAlign: "center",
                        textDecoration: "none",
                      }}
                    >
                      {renderAvatar(official, 170, 20, variant)}
                      <div style={{ height: "10px", flexShrink: 0 }} />
                      <div
                        style={{
                          width: "100%",
                          fontFamily: "\"DINalt\", \"Roboto Condensed\", sans-serif",
                          fontWeight: 700,
                          fontSize: `${fitFontSize(lineOne, 23, 13)}px`,
                          lineHeight: 0.95,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textDecoration: "none",
                        }}
                      >
                        {lineOne}
                      </div>
                      <div
                        style={{
                          width: "100%",
                          fontFamily: "\"DINalt\", \"Roboto Condensed\", sans-serif",
                          fontWeight: 600,
                          fontSize: `${fitFontSize(lineTwo, 15, 14)}px`,
                          lineHeight: 0.95,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textDecoration: "none",
                        }}
                      >
                        {lineTwo}
                      </div>
                      {official.role === "crewChief" ? (
                        <div
                          style={{
                            marginTop: "4px",
                            fontFamily: "\"DINalt\", \"Roboto Condensed\", sans-serif",
                            fontWeight: 600,
                            fontSize: "10px",
                            lineHeight: 1,
                            textDecoration: "none",
                          }}
                        >
                          Crew Chief
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div style={{ flex: 1 }} />
            </>
          ) : (
            <>
              <div
                style={{
                  height: "360px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  fontSize: "20px",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Officials not posted.
              </div>
              <div style={{ flex: 1 }} />
            </>
          )}
          {alternates.length ? (
            <div
              style={{
                paddingTop: "6px",
                fontFamily: "\"DINalt\", \"Roboto Condensed\", sans-serif",
                fontWeight: 600,
                fontSize: "12px",
                lineHeight: 1,
                textAlign: "center",
                textDecoration: "none",
              }}
            >
              {`Alternate: ${alternates.join(", ")}`}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function VisibleOfficialTile({ official }) {
  return (
    <div className={styles.officialTile}>
      <div className={styles.avatarFrame}>
        {official.headshotUrl ? (
          <img
            className={styles.avatarImage}
            src={official.headshotUrl}
            alt={official.fullName}
            style={official.fullName === "Eric Lewis" ? { transform: "translateY(4px) scale(1.08)" } : undefined}
          />
        ) : (
          <div className={styles.avatarFallback}>{getInitials(official.fullName)}</div>
        )}
      </div>
      <div className={styles.nameText}>
        {getPortraitNameText(official)}
      </div>
      {official.role === "crewChief" ? (
        <div className={styles.roleText}>Crew Chief</div>
      ) : null}
    </div>
  );
}

function Spinner() {
  return <span className={styles.spinner} aria-hidden="true" />;
}

export default function OfficialsExportPanel({ officials, gameId }) {
  const { primary, alternates } = useMemo(() => buildOfficialsData(officials), [officials]);
  const portraitRef = useRef(null);
  const landscapeRef = useRef(null);
  const [busyFormat, setBusyFormat] = useState("");
  const [templateThemeMode, setTemplateThemeMode] = useState(() => getThemeMode());

  const handleExport = async (format) => {
    if (busyFormat) return;
    setBusyFormat(format);

    try {
      const themeMode = getThemeMode();
      setTemplateThemeMode(themeMode);

      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
      await waitForFrame();

      const colors = getTextColors(themeMode);
      const portraitSpec = EXPORT_SPECS.portrait;
      const landscapeSpec = EXPORT_SPECS.landscape;

      if (format === "portrait") {
        const sourceCanvas = await renderNodeToCanvas(
          portraitRef.current,
          portraitSpec.logicalWidth,
          portraitSpec.logicalHeight
        );
        const { canvas, context } = makeOutputCanvas(
          portraitSpec.outputWidth,
          portraitSpec.outputHeight,
          colors.background
        );
        drawContain(context, sourceCanvas, 0, 0, portraitSpec.outputWidth, portraitSpec.outputHeight);
        downloadCanvas(canvas, `officials-${gameId || "game"}-portrait.png`);
        return;
      }

      if (format === "landscape") {
        const sourceCanvas = await renderNodeToCanvas(
          landscapeRef.current,
          landscapeSpec.logicalWidth,
          landscapeSpec.logicalHeight
        );
        const { canvas, context } = makeOutputCanvas(
          landscapeSpec.outputWidth,
          landscapeSpec.outputHeight,
          colors.background
        );
        drawContain(context, sourceCanvas, 0, 0, landscapeSpec.outputWidth, landscapeSpec.outputHeight);
        downloadCanvas(canvas, `officials-${gameId || "game"}-landscape.png`);
        return;
      }

      const wasSpec = EXPORT_SPECS.was;
      const sourceCanvas = await renderNodeToCanvas(
        portraitRef.current,
        portraitSpec.logicalWidth,
        portraitSpec.logicalHeight
      );
      const { canvas, context } = makeOutputCanvas(wasSpec.outputWidth, wasSpec.outputHeight, "#ffffff");
      context.fillStyle = colors.background;
      context.fillRect(wasSpec.boxX, wasSpec.boxY, wasSpec.boxWidth, wasSpec.boxHeight);
      drawContain(
        context,
        sourceCanvas,
        wasSpec.boxX,
        wasSpec.boxY,
        wasSpec.boxWidth,
        wasSpec.boxHeight
      );
      downloadCanvas(canvas, `officials-${gameId || "game"}-was.png`);
    } catch (error) {
      console.error("Failed to export officials graphic.", error);
    } finally {
      setBusyFormat("");
    }
  };

  return (
    <>
      <section className={styles.container} aria-label="Tonight's officials">
        <div className={styles.contentColumn}>
          <div className={styles.header}>Tonight&apos;s Officials</div>
          {primary.length ? (
            <div className={styles.officialsRow}>
              {primary.map((official) => (
                <VisibleOfficialTile key={official.id} official={official} />
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>Officials not posted.</div>
          )}
          {alternates.length ? (
            <div className={styles.footer}>{`Alternate: ${alternates.join(", ")}`}</div>
          ) : null}
        </div>
        <div className={styles.buttonColumn}>
          {["portrait", "landscape", "was"].map((format) => {
            const spec = EXPORT_SPECS[format];
            const busy = busyFormat === format;
            return (
              <button
                key={format}
                type="button"
                className={styles.exportButton}
                onClick={() => handleExport(format)}
                disabled={Boolean(busyFormat)}
              >
                {busy ? <Spinner /> : spec.label}
              </button>
            );
          })}
        </div>
      </section>

      <div className={styles.exportSandbox} aria-hidden="true">
        <div ref={portraitRef}>
          <ExportTemplate
            variant="portrait"
            primaryOfficials={primary}
            alternates={alternates}
            themeMode={templateThemeMode}
          />
        </div>
        <div ref={landscapeRef}>
          <ExportTemplate
            variant="landscape"
            primaryOfficials={primary}
            alternates={alternates}
            themeMode={templateThemeMode}
          />
        </div>
      </div>
    </>
  );
}
