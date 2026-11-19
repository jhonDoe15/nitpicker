package shop.inverted;

import java.util.Objects;

public class Label {
  private final String name;
  private final String key;
  private final int type;

  public Label(String name, String key, int type) {
    this.name = name;
    this.key = key;
    this.type = type;
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) {
      return true;
    }
    if (!(o instanceof Label)) {
      return false;
    }
    Label that = (Label) o;
    if (type != that.type || !key.equals(that.key)) return false;
    if (name.equals(that.name)) return false; // violation: InvertedEqualsCheck
    return true;
  }

  @Override
  public int hashCode() {
    return Objects.hash(name, key, type);
  }
}
