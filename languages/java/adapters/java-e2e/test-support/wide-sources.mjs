export const WIDE = `package demo;

public final class Wide {
  public int sum(int a, int b, int c, int d) {
    return a + b + c + d;
  }
}
`;

export const WIDE_EXTENDED = WIDE.replace(
  '  public int sum',
  `  public int deep(int a) {
    int total = 0;
    if (a > 0) {
      for (int i = 0; i < a; i++) {
        if (i % 2 == 0) {
          total += i;
        }
      }
    }
    return total;
  }

  public int chain(int a) {
    int total = 0;
    for (int i = 0; i < a; i++) {
      if (i == 1) {
        total += 1;
      } else if (i == 2) {
        total += 2;
      } else if (i == 3) {
        total += 3;
      } else {
        total += 4;
      }
    }
    return total;
  }

  public int nested(int a) {
    int total = 0;
    for (int i = 0; i < a; i++) {
      if (i == 1) {
        total += 1;
      } else {
        if (i == 2) {
          total += 2;
        }
      }
    }
    return total;
  }

  public int sum`,
);

export const WIDE_REFORMATTED = WIDE.replace(
  '  public int sum',
  '  // Still too wide.\n  public int sum',
);

export function pricingClass(name, label) {
  return `package demo;

public final class ${name} {
  public long total(long[] prices, long discount, StringBuilder log) {
    long sum = 0;
    for (long price : prices) {
      if (price > discount) {
        sum += price - discount;
      }
    }
    log.append("${label}").append(':').append(sum);
    return sum > 1000 ? sum - discount : sum;
  }
}
`;
}
