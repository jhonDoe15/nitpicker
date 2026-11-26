package fixed;

import java.util.List;

public class Catalog {
  private final List<String> codes;
  private final List<String> letters = List.of("a", "b");

  public Catalog(List<String> codes) {
    this.codes = List.copyOf(codes);
  }

  public int indexOf(String code) {
    int index = 0;
    for (String known : codes) {
      if (known.equals(code)) {
        return index;
      }
      index++;
    }
    return -1;
  }

  public boolean letter(String code) {
    return letters.stream().anyMatch(known -> known.equals(code));
  }

  public int first() {
    return letter("a") ? indexOf("a") : 0;
  }

  public int second() {
    return letter("b") ? indexOf("b") : 0;
  }

  public int third() {
    return letter("c") ? indexOf("c") : 0;
  }

  public String get(String code) {
    return codes.stream().filter(known -> known.equals(code)).findFirst().orElse(null);
  }

  public String get(Integer index) {
    return codes.get(index);
  }

  public String twice() {
    return get("a") + get("b") + get(0);
  }
}
