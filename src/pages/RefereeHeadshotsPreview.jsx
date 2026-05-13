import styles from "./RefereeHeadshotsPreview.module.css";

const WNBA_REFEREE_FILE_NAMES = [
  "Agon Abazi.jpg",
  "Amy Bonner.jpg",
  "Angel Kent.jpg",
  "Angelica Suffren.jpg",
  "Ashley Gloss.jpg",
  "Blanca Burns.jpg",
  "Cat Chang.jpg",
  "Charles Watson.jpg",
  "Clare Simmons.jpg",
  "Fatou Cissoko-Stephens.jpg",
  "Genesis Perrymond.jpg",
  "Gerda Gatling.jpg",
  "Gina Cross.jpg",
  "Isaac Barnett.jpg",
  "Jason Alabanza.jpg",
  "Jeff Wooten.jpg",
  "Josh Reed.jpg",
  "Kelly Broomfield.jpg",
  "Kelsey Reynolds.jpg",
  "Ken Jones.jpg",
  "Kevin Fahy.jpg",
  "Leah Lanie.jpg",
  "Maj Forsberg.jpg",
  "Marcy Williams.jpg",
  "RJ Johnson.jpg",
  "Randy Richardson.jpg",
  "Roy Gulbeyan.jpg",
  "Ryan Sassano.jpg",
  "Sarah Williams.jpg",
  "Teresa Stuck.jpg",
  "Tiara Cruse.jpg",
  "Tim Greene.jpg",
  "Toni Patillo.jpg",
  "Tyler Mirkovich.jpg",
];

const DUPLICATE_FILE_NAMES = new Set([
  "Agon Abazi.jpg",
  "Marcy Williams.jpg",
  "Tyler Mirkovich.jpg",
]);

const IMAGE_MODULES = import.meta.glob(
  [
    "../assets/referees/*.{jpg,jpeg,JPG,JPEG}",
    "../assets/referees_review_duplicates/*.{jpg,jpeg,JPG,JPEG}",
  ],
  { eager: true, import: "default" }
);

const imageEntries = Object.entries(IMAGE_MODULES).reduce((map, [path, url]) => {
  const fileName = path.split("/").pop() || "";
  const source = path.includes("/referees_review_duplicates/") ? "duplicate" : "primary";
  const existing = map.get(fileName);
  if (!existing || source === "primary") {
    map.set(fileName, { url, source });
  }
  return map;
}, new Map());

const previewItems = WNBA_REFEREE_FILE_NAMES.map((fileName) => {
  const image = imageEntries.get(fileName) || null;
  return {
    fileName,
    displayName: fileName.replace(/\.(jpe?g)$/i, ""),
    isDuplicate: DUPLICATE_FILE_NAMES.has(fileName),
    url: image?.url || null,
    source: image?.source || "missing",
  };
});

export default function RefereeHeadshotsPreview() {
  const availableCount = previewItems.filter((item) => item.url).length;

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div>
          <h1 className={styles.title}>WNBA Referee Headshot Preview</h1>
          <p className={styles.subtitle}>
            Preview uses the same square crop behavior as the officials panel:
            {" "}
            <code>object-fit: cover</code>
            {" "}
            with
            {" "}
            <code>object-position: center top</code>.
          </p>
        </div>
        <div className={styles.summary}>
          <span>{availableCount} / {previewItems.length} loaded</span>
          <span>3 duplicates held out of production assets</span>
          <span>Route: /tools/referee-headshots</span>
        </div>
      </div>

      <div className={styles.grid}>
        {previewItems.map((item) => (
          <article key={item.fileName} className={styles.card}>
            <div className={styles.cropFrame}>
              {item.url ? (
                <img
                  src={item.url}
                  alt={item.displayName}
                  className={styles.cropImage}
                />
              ) : (
                <div className={styles.missing}>Missing</div>
              )}
            </div>
            <div className={styles.meta}>
              <div className={styles.name}>{item.displayName}</div>
              <div className={styles.badges}>
                {item.isDuplicate ? <span className={styles.badgeWarn}>Duplicate</span> : null}
                <span className={styles.badge}>{item.source}</span>
              </div>
            </div>
            {item.url ? (
              <div className={styles.rawFrame}>
                <img
                  src={item.url}
                  alt={`${item.displayName} raw portrait`}
                  className={styles.rawImage}
                />
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
