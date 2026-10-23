package fluent;

import java.util.List;
import lombok.Getter;

@Getter
public final class Item {
  private final String name;

  public Item(String name) {
    this.name = name;
  }

  public int size() {
    return name().length();
  }

  public List raw() {
    return List.of(name);
  }
}
