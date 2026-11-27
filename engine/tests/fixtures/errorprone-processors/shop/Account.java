package shop;

import com.google.auto.value.AutoValue;

@AutoValue
public abstract class Account {
  public abstract String owner();

  public abstract Money balance();

  public static Builder builder() {
    return new AutoValue_Account.Builder();
  }

  @Override
  public final String toString() {
    return owner();
  }

  @AutoValue.Builder
  public abstract static class Builder {
    public abstract Builder owner(String owner);

    public abstract Builder balance(Money balance);

    public abstract Account build();
  }
}
