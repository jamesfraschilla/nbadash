export function getNbaCupInfo(game = {}) {
  const gameLabel = String(game?.gameLabel || "").trim();
  const gameSubLabel = String(game?.gameSubLabel || "").trim();
  const gameSubtype = String(game?.gameSubtype || "").trim();
  const providedIsCup = game?.isNbaCup === true || String(game?.isNbaCup || "").toLowerCase() === "true";
  const cupText = `${gameLabel} ${gameSubLabel} ${gameSubtype}`.toLowerCase();
  const isNbaCup = providedIsCup || cupText.includes("nba cup") || cupText.includes("in-season");
  let nbaCupStage = String(game?.nbaCupStage || "").trim();
  let nbaCupGroup = String(game?.nbaCupGroup || "").trim();

  if (isNbaCup && !nbaCupStage) {
    if (/championship/i.test(gameSubLabel)) {
      nbaCupStage = "Championship";
    } else if (/semifinal/i.test(gameSubLabel)) {
      nbaCupStage = "Semifinal";
    } else if (/quarterfinal/i.test(gameSubLabel)) {
      nbaCupStage = "Quarterfinal";
    } else {
      nbaCupStage = "Group Play";
    }
  }

  if (isNbaCup && !nbaCupGroup && /\bgroup\b/i.test(gameSubLabel)) {
    nbaCupGroup = gameSubLabel;
  }

  return {
    gameLabel,
    gameSubLabel,
    gameSubtype,
    isNbaCup,
    nbaCupStage,
    nbaCupGroup,
  };
}

export function isNbaCupGame(game = {}) {
  return getNbaCupInfo(game).isNbaCup;
}
