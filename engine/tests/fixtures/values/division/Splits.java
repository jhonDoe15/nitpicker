package values.division;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;

public class Splits {
  private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);
  private static final BigDecimal THIRD = new BigDecimal("3");

  public BigDecimal share(BigDecimal total, int parts) {
    return total.divide(BigDecimal.valueOf(parts));
  }

  public BigDecimal ratio(BigDecimal left, BigDecimal right) {
    return left.divide(right);
  }

  public BigDecimal thirds(BigDecimal total) {
    return total.divide(THIRD);
  }

  public BigDecimal monthly(BigDecimal total, int months) {
    BigDecimal divisor = BigDecimal.valueOf(months);
    return total.divide(divisor);
  }

  public BigDecimal rounded(BigDecimal total, int parts) {
    return total.divide(BigDecimal.valueOf(parts), 2, RoundingMode.HALF_EVEN);
  }

  public BigDecimal contextual(BigDecimal total, BigDecimal parts) {
    return total.divide(parts, MathContext.DECIMAL64);
  }

  public BigDecimal percent(BigDecimal total) {
    return total.divide(HUNDRED);
  }

  public BigDecimal half(BigDecimal total) {
    return total.divide(new BigDecimal("0.5"));
  }

  public BigDecimal tenth(BigDecimal total) {
    return total.divide(BigDecimal.TEN);
  }

  public BigDecimal quarter(BigDecimal total) {
    return total.divide(BigDecimal.valueOf(4));
  }

  public BigDecimal guarded(BigDecimal total, BigDecimal parts) {
    try {
      return total.divide(parts);
    } catch (ArithmeticException e) {
      return BigDecimal.ZERO;
    }
  }

  public BigDecimal fallback(BigDecimal total, BigDecimal parts) {
    try {
      return total.divide(parts);
    } catch (Exception e) {
      return total.divide(parts, 2, RoundingMode.HALF_UP);
    }
  }

  public BigDecimal handlerOnly(BigDecimal total, BigDecimal parts) {
    try {
      return total.add(parts);
    } catch (ArithmeticException e) {
      return total.divide(parts);
    }
  }

  public BigDecimal fromMathPow(BigDecimal total, int digits) {
    BigDecimal divisor = new BigDecimal(Math.pow(10, digits));
    return total.divide(divisor);
  }

  public BigDecimal inlineMathPow(BigDecimal total, int digits) {
    return total.divide(new BigDecimal(Math.pow(10, digits)));
  }

  public BigDecimal fromTenPow(BigDecimal total, int digits) {
    BigDecimal divisor = BigDecimal.TEN.pow(digits);
    return total.divide(divisor);
  }

  public BigDecimal fromValueOfPow(BigDecimal total, int digits) {
    BigDecimal divisor = BigDecimal.valueOf(10).pow(digits);
    return total.divide(divisor);
  }

  public BigDecimal fromScale(BigDecimal total, int digits) {
    BigDecimal divisor = BigDecimal.ONE.scaleByPowerOfTen(digits);
    return total.divide(divisor);
  }

  public BigDecimal localHundred(BigDecimal total) {
    BigDecimal hundred = BigDecimal.valueOf(100);
    return total.divide(hundred);
  }

  public BigDecimal localString(BigDecimal total) {
    final BigDecimal pct = new BigDecimal("100");
    return total.divide(pct);
  }

  public BigDecimal scaled(BigDecimal total) {
    return total.divide(BigDecimal.valueOf(25, 2));
  }

  public BigDecimal exponent(BigDecimal total) {
    return total.divide(new BigDecimal("1E+2"));
  }

  public BigDecimal otherFile(BigDecimal total) {
    return total.divide(Rates.SEVEN);
  }

  public BigDecimal anyPow(BigDecimal total, BigDecimal rate) {
    return total.divide(rate.pow(10));
  }

  public BigDecimal anyScale(BigDecimal total, BigDecimal rate) {
    return total.divide(rate.scaleByPowerOfTen(2));
  }
}
