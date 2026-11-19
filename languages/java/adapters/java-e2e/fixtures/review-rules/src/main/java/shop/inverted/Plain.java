package shop.inverted;

import java.util.Objects;

public class Plain {
  private final String name;
  private final String key;
  private final int type;

  public Plain(String name, String key, int type) {
    this.name = name;
    this.key = key;
    this.type = type;
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) return true;
    if (!(o instanceof Plain)) return false;
    Plain that = (Plain) o;
    if (!name.equals(that.name)) return false;
    if (type != that.type || !key.equals(that.key)) return false;
    return true;
  }

  @Override
  public int hashCode() {
    return Objects.hash(name, key, type);
  }
}

class Shortcut {
  private final String name;
  private final int type;

  Shortcut(String name, int type) {
    this.name = name;
    this.type = type;
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) return true;
    if (!(o instanceof Shortcut)) return false;
    Shortcut that = (Shortcut) o;
    if (name.equals(that.name)) return true;
    return type == that.type;
  }

  @Override
  public int hashCode() {
    return Objects.hash(name, type);
  }

  public boolean differsInName(Shortcut that) {
    if (name.equals(that.name)) return false;
    return type == that.type;
  }
}
