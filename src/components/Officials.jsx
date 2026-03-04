import { teamLogoUrl } from "../api.js";
import styles from "./Officials.module.css";

const ROLE_ORDER = {
  crewChief: 0,
  referee: 1,
  umpire: 2,
};

function normalizeRole(rawValue) {
  const compact = String(rawValue || "").replace(/[^a-z]/gi, "").toLowerCase();
  if (!compact) return "referee";
  if (compact.includes("alternate")) return "alternate";
  if (compact === "crewchief" || (compact.includes("crew") && compact.includes("chief"))) {
    return "crewChief";
  }
  if (compact.includes("umpire")) return "umpire";
  if (compact.includes("referee")) return "referee";
  return "referee";
}

function getOrderedOfficials(officials) {
  return [...(officials || [])]
    .filter((official) => {
      const role = normalizeRole(
        official?.assignment ||
        official?.role ||
        official?.title ||
        official?.position ||
        official?.officialRole ||
        official?.roleName
      );
      const explicitAlternate = Boolean(official?.isAlternate || official?.alternate);
      return !explicitAlternate && role !== "alternate";
    })
    .sort((a, b) => {
      const aRole = normalizeRole(
        a?.assignment ||
        a?.role ||
        a?.title ||
        a?.position ||
        a?.officialRole ||
        a?.roleName
      );
      const bRole = normalizeRole(
        b?.assignment ||
        b?.role ||
        b?.title ||
        b?.position ||
        b?.officialRole ||
        b?.roleName
      );
      const aOrder = ROLE_ORDER[aRole] ?? 99;
      const bOrder = ROLE_ORDER[bRole] ?? 99;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return `${a?.firstName || ""} ${a?.familyName || ""}`.localeCompare(
        `${b?.firstName || ""} ${b?.familyName || ""}`
      );
    });
}

export default function Officials({ officials, callsAgainst, homeAbr, awayAbr, homeTeam, awayTeam }) {
  const orderedOfficials = getOrderedOfficials(officials);
  if (!orderedOfficials.length) return null;

  const awayTotal = callsAgainst
    ? orderedOfficials.reduce((sum, official) => sum + (callsAgainst?.[official.personId]?.[awayAbr] ?? 0), 0)
    : 0;
  const homeTotal = callsAgainst
    ? orderedOfficials.reduce((sum, official) => sum + (callsAgainst?.[official.personId]?.[homeAbr] ?? 0), 0)
    : 0;
  const awayLogo = awayTeam?.teamId ? teamLogoUrl(awayTeam.teamId) : null;
  const homeLogo = homeTeam?.teamId ? teamLogoUrl(homeTeam.teamId) : null;
  const awayAlt = awayTeam?.teamName || awayAbr || "Away team";
  const homeAlt = homeTeam?.teamName || homeAbr || "Home team";

  return (
    <section className={styles.container}>
      {callsAgainst ? (
        <table className={styles.callsTable}>
          <thead>
            <tr className={styles.headerRow}>
              <th className={styles.headerCellLeft}>
                <div className={styles.callsAgainstLabel}>Calls Against</div>
              </th>
              <th className={styles.headerCell}>Total</th>
              {orderedOfficials.map((official) => (
                <th key={official.personId} className={styles.headerCell} aria-hidden="true">
                  <span className={styles.columnSpacer} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={styles.teamCell}>
                {awayLogo ? (
                  <img className={styles.teamLogo} src={awayLogo} alt={`${awayAlt} logo`} />
                ) : (
                  awayAbr
                )}
              </td>
              <td className={styles.dataCell}>{awayTotal}</td>
              {orderedOfficials.map((official) => (
                <td key={official.personId} className={styles.dataCell}>
                  {callsAgainst?.[official.personId]?.[awayAbr] ?? 0}
                </td>
              ))}
            </tr>
            <tr>
              <td className={styles.teamCell}>
                {homeLogo ? (
                  <img className={styles.teamLogo} src={homeLogo} alt={`${homeAlt} logo`} />
                ) : (
                  homeAbr
                )}
              </td>
              <td className={styles.dataCell}>{homeTotal}</td>
              {orderedOfficials.map((official) => (
                <td key={official.personId} className={styles.dataCell}>
                  {callsAgainst?.[official.personId]?.[homeAbr] ?? 0}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      ) : (
        <div className={styles.officialsStack}>
          {orderedOfficials.map((official) => (
            <div key={official.personId} className={styles.officialItem}>
              <span className={styles.officialName}>
                #{official.jerseyNum} {official.firstName} {official.familyName}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
