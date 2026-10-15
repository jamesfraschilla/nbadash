const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export function sortPlaycallRows(rows = [], sort = {}) {
  const field = String(sort.field || "");
  const direction = sort.direction === "descending" ? "descending" : "ascending";
  const indexedRows = rows.map((row, sourceIndex) => ({ row, sourceIndex }));
  if (!field) return indexedRows;

  return indexedRows.sort((left, right) => {
    const leftValue = String(left.row?.[field] || "").trim();
    const rightValue = String(right.row?.[field] || "").trim();
    if (!leftValue && !rightValue) return left.sourceIndex - right.sourceIndex;
    if (!leftValue) return 1;
    if (!rightValue) return -1;
    const comparison = collator.compare(leftValue, rightValue);
    return comparison === 0
      ? left.sourceIndex - right.sourceIndex
      : direction === "descending" ? -comparison : comparison;
  });
}

export function nextPlaycallSort(current = {}, field) {
  if (current.field !== field) return { field, direction: "ascending" };
  if (current.direction === "ascending") return { field, direction: "descending" };
  return { field: "", direction: "" };
}
