export const DEFAULT_FINAL_SLOT_OFFSET_MINUTES = 45;
export const DEFAULT_SLOT_INTERVAL_MINUTES = 15;

export function buildDefaultPregameSlotOffsets(count) {
  const slotCount = Math.max(1, Number(count) || 1);
  return Array.from({ length: slotCount }, (_, index) => (
    DEFAULT_FINAL_SLOT_OFFSET_MINUTES
    + ((slotCount - 1 - index) * DEFAULT_SLOT_INTERVAL_MINUTES)
  ));
}
