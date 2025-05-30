export const genericCompare = (a, b) => {
  // if (a === undefined || b === undefined) {
  //   throw new Error("value is undefined"+" " + a + b);
  // }

  const valueA = Array.isArray(a) ? Math.min(...a) : a;
  const valueB = Array.isArray(b) ? Math.min(...b) : b;

  if (valueA === valueB) {
    return 0;
  }

  if(valueA === undefined || Number.isNaN(valueA) || valueA === Infinity){
    return 2;
  }

  if(valueB === undefined || Number.isNaN(valueB) || valueB === Infinity){
    return -2;
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

export function splitByProperty(arr, property) {
    return Object.values(arr.reduce((acc, obj) => {
        let key = obj[property];
        if (!acc[key]) {
            acc[key] = [];
        }
        acc[key].push(obj);
        return acc;
    }, {}));
}

// export function expandObjects(arr, key) {
//     return arr.flatMap(obj =>
//         Array.isArray(obj[key])
//             ? obj[key].map(value => ({name: obj.name, specialQualifications: obj.specialQualifications, [key]: [value], timeId: obj.timeId, [key]: value }))
//             : [obj] // 
//     );
// }

export function expandObjects(arr, key) {
    return arr.flatMap(obj =>
        Array.isArray(obj[key])
            ? obj[key].length > 0
                ? obj[key].map(value => ({
                    name: obj.name,
                    specialQualifications: obj.specialQualifications,
                    // special: obj.special,
                    [key]: value,
                    timeId: obj.timeId
                }))
                : [{ 
                    name: obj.name,
                    specialQualifications: obj.specialQualifications,
                    [key]: undefined, // should rly inserts `undefined` but w/e
                    timeId: obj.timeId
                }]
            : [obj]
    );
}





