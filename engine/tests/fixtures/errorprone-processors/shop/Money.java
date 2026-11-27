package shop;

import com.google.auto.value.AutoValue;
import java.util.List;

@AutoValue
public abstract class Money {
  public abstract String currency();

  public abstract String label();

  public abstract List<String> notes();

  public static Money of(String currency, String label) {
    return new AutoValue_Money(currency, label, List.of());
  }

  static Money swapped(String currency, String label) {
    return new AutoValue_Money(label, currency, List.of());
  }

  public boolean same(Money other) {
    return this == other;
  }
}
