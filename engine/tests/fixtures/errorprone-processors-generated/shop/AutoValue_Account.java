package shop;

import javax.annotation.processing.Generated;

@Generated("com.google.auto.value.processor.AutoValueProcessor")
final class AutoValue_Account extends Account {

  private final String owner;

  private final Money balance;

  private AutoValue_Account(
      String owner,
      Money balance) {
    this.owner = owner;
    this.balance = balance;
  }

  @Override
  public String owner() {
    return owner;
  }

  @Override
  public Money balance() {
    return balance;
  }

  @Override
  public boolean equals(Object o) {
    if (o == this) {
      return true;
    }
    if (o instanceof Account) {
      Account that = (Account) o;
      return this.owner.equals(that.owner())
          && this.balance.equals(that.balance());
    }
    return false;
  }

  @Override
  public int hashCode() {
    int h$ = 1;
    h$ *= 1000003;
    h$ ^= owner.hashCode();
    h$ *= 1000003;
    h$ ^= balance.hashCode();
    return h$;
  }

  static final class Builder extends Account.Builder {
    private String owner;
    private Money balance;
    Builder() {
    }
    @Override
    public Account.Builder owner(String owner) {
      if (owner == null) {
        throw new NullPointerException("Null owner");
      }
      this.owner = owner;
      return this;
    }
    @Override
    public Account.Builder balance(Money balance) {
      if (balance == null) {
        throw new NullPointerException("Null balance");
      }
      this.balance = balance;
      return this;
    }
    @Override
    public Account build() {
      if (this.owner == null
          || this.balance == null) {
        StringBuilder missing = new StringBuilder();
        if (this.owner == null) {
          missing.append(" owner");
        }
        if (this.balance == null) {
          missing.append(" balance");
        }
        throw new IllegalStateException("Missing required properties:" + missing);
      }
      return new AutoValue_Account(
          this.owner,
          this.balance);
    }
  }

}
