export function branches(items: readonly number[], flag: boolean, other: boolean): number {
  let total = 0;
  outer: for (const item of items) {
    if (item > 1 && flag && other) {
      for (let index = 0; index < item; index += 1) {
        if (index === 2 || (flag && !other)) {
          continue outer;
        } else if (index === 3) {
          break outer;
        } else {
          total += flag ? (other ? 1 : 2) : 3;
        }
      }
    }
    while (total > 10) {
      try {
        total -= 1;
      } catch {
        do {
          total += 1;
        } while (total < 0 ?? flag);
      }
    }
  }
  switch (total) {
    case 1:
      return flag ? 1 : 0;
    default:
      return total;
  }
}

export const arrow = <T,>(value: T, flag: boolean): T /* note => */ => {
  if (flag) {
    if (value) {
      if (flag && value) {
        if (!flag || !value) {
          for (const part of [value]) {
            if (part) {
              return part;
            }
          }
        }
      }
    }
  }
  return value;
};

export const holder = {
  method(flag: boolean, again: boolean): number {
    if (flag) {
      if (again) {
        if (flag && again) {
          while (flag) {
            if (again || flag) {
              return again ? 1 : 2;
            }
          }
        }
      }
    }
    return 0;
  },
  arrowValue: async (flag: boolean) => {
    if (flag) {
      if (flag) {
        if (flag) {
          if (flag) {
            if (flag && flag) {
              return 1;
            }
          }
        }
      }
    }
    return 0;
  },
};

export class Owner {
  #hidden = (flag: boolean): number => {
    for (const a of [1]) {
      for (const b of [a]) {
        for (const c of [b]) {
          if (c && flag) {
            if (c) {
              return c;
            }
          }
        }
      }
    }
    return 0;
  };

  [Symbol.iterator](flag = false) {
    if (flag) {
      if (flag) {
        if (flag) {
          if (flag) {
            if (flag || flag) {
              return 1;
            }
          }
        }
      }
    }
    return 0;
  }
}

export default function (flag: boolean): number {
  return [1].map(async function (value) {
    if (flag) {
      if (value) {
        if (flag) {
          if (value) {
            if (flag && value) {
              return 1;
            }
          }
        }
      }
    }
    return 0;
  }).length;
}

export const plain = (flag: boolean) =>
  // why
  flag && flag ? (flag ? (flag ? (flag ? (flag ? 1 : 2) : 3) : 4) : 5) : 6;
