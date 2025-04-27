export const genericCompare = (a, b) => {
  if (a === undefined || b === undefined) {
    throw new Error("value is undefined");
  }

  const valueA = Array.isArray(a) ? Math.min(...a) : a;
  const valueB = Array.isArray(b) ? Math.min(...b) : b;

  if (valueA === valueB) {
    return 0;
  }

  return valueA > valueB ? 1 : -1;
};

export const priorityComparison = (keyOrder) => (a, b) => {
  for (const key of keyOrder) {
    const result = genericCompare(a[key], b[key]);
    if (result !== 0) {
      return result;
    }
  }
  return 0;
};
