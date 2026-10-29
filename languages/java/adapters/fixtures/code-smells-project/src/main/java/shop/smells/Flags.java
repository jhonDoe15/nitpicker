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

  public void drain(java.util.List<String> items, boolean all) { // violation: BooleanFlagParameter
    while (all && !items.isEmpty()) {
      items.remove(0);
    }
  }

  public void trim(java.util.List<String> items, boolean once) { // violation: BooleanFlagParameter
    do {
      items.remove(0);
    } while (once == false && !items.isEmpty());
  }

  public java.util.function.Supplier<String> later(String text, boolean upper) { // violation: BooleanFlagParameter
    return () -> upper ? text.toUpperCase() : text;
  }

  public static Flags valueOf(boolean value) {
    return value ? new Flags() : of(false);
  }
}
