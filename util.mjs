export const genericCompare = (a, b) => {
  if (a === undefined || b === undefined) {
    throw new Error("value is undefined");
  }
  if (Array.isArray(a)) {
    return genericCompare(Math.min(...a), Math.min(...b));
  } else {
    if (a === b) {
      return 0;
    } else {
      return a > b ? 1 : -1;
    }
  }
};

export const priorityComparison = (keyOrder) => (a, b) => {
  for (let i = 0; i < keyOrder.length; i++) {
    const out = genericCompare(a[keyOrder[i]], b[keyOrder[i]]);
    if (out !== 0) {
      return out;
    }
  }
  return 0;
};
