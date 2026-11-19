package shop.inverted;

import java.util.Arrays;
import java.util.Objects;

public class Slot {
  private final String key;
  private final int type;
  private final int[] codes;

  public Slot(String key, int type, int[] codes) {
    this.key = key;
    this.type = type;
    this.codes = codes.clone();
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) return true;
    if (!(o instanceof Slot)) return false;
    Slot that = (Slot) o;
    if (type != that.type || key.equals(that.key)) return false; // violation: InvertedEqualsCheck
    return true;
  }

  public boolean sameCodes(Object o) {
    if (!(o instanceof Slot that)) return false;
    if (Arrays.equals(codes, that.codes)) {
      return false;
    }
    return key.equals(that.key);
  }

  @Override
  public int hashCode() {
    return Objects.hash(key, type, Arrays.hashCode(codes));
  }
}

class Codes {
  private final String name;
  private final int[] codes;

  Codes(String name, int[] codes) {
    this.name = name;
    this.codes = codes.clone();
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) return true;
    if (!(o instanceof Codes that)) return false;
    if (!name.equals(that.name)) return false;
    if (Arrays.equals(codes, that.codes)) { // violation: InvertedEqualsCheck
      return false;
    }
    return true;
  }

  @Override
  public int hashCode() {
    return Objects.hash(name, Arrays.hashCode(codes));
  }
}

class Derived extends Slot {
  private final String owner;

  Derived(String owner) {
    super(owner, 0, new int[0]);
    this.owner = owner;
  }

  @Override
  public boolean equals(Object obj) {
    if (this == obj) return true;
    if (obj == null || getClass() != obj.getClass()) return false;
    Derived other = (Derived) obj;
    if (!Objects.equals(owner, other.owner)) return false;
    if (super.equals(obj)) return false; // violation: InvertedEqualsCheck
    return true;
  }

  @Override
  public int hashCode() {
    return Objects.hash(owner);
  }
}
