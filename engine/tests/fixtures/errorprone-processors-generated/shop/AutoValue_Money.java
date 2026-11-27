package shop;

import java.util.List;
import javax.annotation.processing.Generated;

@Generated("com.google.auto.value.processor.AutoValueProcessor")
final class AutoValue_Money extends Money {

  private final String currency;

  private final String label;

  private final List<String> notes;

  AutoValue_Money(
      String currency,
      String label,
      List<String> notes) {
    if (currency == null) {
      throw new NullPointerException("Null currency");
    }
    this.currency = currency;
    if (label == null) {
      throw new NullPointerException("Null label");
    }
    this.label = label;
    if (notes == null) {
      throw new NullPointerException("Null notes");
    }
    this.notes = notes;
  }

  @Override
  public String currency() {
    return currency;
  }

  @Override
  public String label() {
    return label;
  }

  @Override
  public List<String> notes() {
    return notes;
  }

  @Override
  public String toString() {
    return "Money{"
        + "currency=" + currency + ", "
        + "label=" + label + ", "
        + "notes=" + notes
        + "}";
  }

  @Override
  public boolean equals(Object o) {
    if (o == this) {
      return true;
    }
    if (o instanceof Money) {
      Money that = (Money) o;
      return this.currency.equals(that.currency())
          && this.label.equals(that.label())
          && this.notes.equals(that.notes());
    }
    return false;
  }

  @Override
  public int hashCode() {
    int h$ = 1;
    h$ *= 1000003;
    h$ ^= currency.hashCode();
    h$ *= 1000003;
    h$ ^= label.hashCode();
    h$ *= 1000003;
    h$ ^= notes.hashCode();
    return h$;
  }

}
