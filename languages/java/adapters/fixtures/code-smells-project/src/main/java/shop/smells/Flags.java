package shop.smells;

public final class Flags {
  private boolean enabled;

  public String render(String text, boolean upper) { // violation: BooleanFlagParameter
    return upper ? text.toUpperCase() : text;
  }

  public void setEnabled(boolean enabled) {
    this.enabled = enabled;
  }

  public Flags withEnabled(boolean value) {
    this.enabled = value;
    return this;
  }

  public static Flags of(boolean value) {
    return new Flags().withEnabled(value);
  }

  public boolean both(boolean other) {
    return enabled && other;
  }
}
