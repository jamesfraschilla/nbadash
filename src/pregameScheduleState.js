export function chooseSavedPregameSchedule(remoteSchedule, localSchedule) {
  const remoteSlots = Array.isArray(remoteSchedule?.slots) ? remoteSchedule.slots : [];
  const localSlots = Array.isArray(localSchedule?.slots) ? localSchedule.slots : [];
  const remoteUpdatedAt = Number(remoteSchedule?.updatedAt || 0);
  const localUpdatedAt = Number(localSchedule?.updatedAt || 0);

  if (remoteSlots.length && remoteUpdatedAt >= localUpdatedAt) {
    return { slots: remoteSlots, updatedAt: remoteUpdatedAt, source: "remote" };
  }
  if (localSlots.length) {
    return { slots: localSlots, updatedAt: localUpdatedAt, source: "local" };
  }
  return null;
}
