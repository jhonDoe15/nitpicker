package shop.firsts;

import java.util.Collection;
import java.util.List;

public final class Firsts {
  private static final int GRANTED = 1;

  public String header(List<byte[]> init) {
    String header = "";
    if (init != null) {
      header = new String(init.get(0)); // violation: FirstElementOfMaybeEmpty
    }
    return header;
  }

  public boolean granted(String[] permissions, int[] grantResults) {
    if (grantResults != null && grantResults[0] == GRANTED) { // violation: FirstElementOfMaybeEmpty
      return permissions != null;
    }
    return false;
  }

  public boolean comment(String text) {
    return text != null && text.charAt(0) == '#'; // violation: FirstElementOfMaybeEmpty
  }

  public Object any(Collection<Object> found) {
    return found != null ? found.iterator().next() : null; // violation: FirstElementOfMaybeEmpty
  }

  public String earlyReturn(List<String> names) {
    if (names == null) {
      return "";
    }
    return names.get(0); // violation: FirstElementOfMaybeEmpty
  }

  public String nonEmptyList(List<String> names) {
    if (names != null && !names.isEmpty()) {
      return names.get(0);
    }
    return "";
  }

  public String sized(List<String> names) {
    if (names != null && names.size() > 0) {
      return names.get(0);
    }
    return "";
  }

  public int lengthChecked(int[] values) {
    if (values != null && values.length > 0) {
      return values[0];
    }
    return 0;
  }

  public char textChecked(String text) {
    if (text != null && !text.isEmpty()) {
      return text.charAt(0);
    }
    return ' ';
  }

  public String looped(List<String> names) {
    StringBuilder joined = new StringBuilder();
    if (names != null) {
      for (int i = 0; i < names.size(); i++) {
        joined.append(names.get(i));
      }
    }
    return joined.toString();
  }

  public String built(String first) {
    List<String> names = List.of(first);
    if (names != null) {
      return names.get(0);
    }
    return "";
  }

  public String literal(String first) {
    String[] names = {first};
    if (names != null) {
      return names[0];
    }
    return "";
  }

  public String unchecked(List<String> names) {
    return names.get(0);
  }

  private String internal(List<String> names) {
    if (names != null) {
      return names.get(0);
    }
    return "";
  }

  public String pair(String[] pair) {
    if (pair != null) {
      return pair[0] + pair[1];
    }
    return "";
  }

  public char validated(String text) {
    if (text != null && text.matches("[a-z]+")) {
      return text.charAt(0);
    }
    return ' ';
  }

  public String blankChecked(String name) {
    if (name == null || name.isBlank()) {
      return "";
    }
    return name.substring(0, 1) + name.charAt(0);
  }

  public Firsts(List<String> seeds) {
    if (seeds != null) {
      this.first = seeds.get(0); // violation: FirstElementOfMaybeEmpty
    }
  }

  private String first = "";

  public String run(String[] args) {
    if (args != null) {
      return args[0]; // violation: FirstElementOfMaybeEmpty
    }
    return "";
  }

  public String joined(String... names) {
    return names != null ? names[0] : ""; // violation: FirstElementOfMaybeEmpty
  }

  public char startsWithKey(String text) {
    if (text != null && text.startsWith("x")) {
      return text.charAt(0);
    }
    return ' ';
  }

  public char equalsKey(String text) {
    if (text != null && text.equals("x")) {
      return text.charAt(0);
    }
    return ' ';
  }

  public char literalEquals(String text) {
    if (text != null && !"".equals(text)) {
      return text.charAt(0);
    }
    return ' ';
  }

  public char notEqualsEmpty(String text) {
    if (text != null && !text.equals("")) {
      return text.charAt(0);
    }
    return ' ';
  }

  public char trimmed(String text) {
    if (text != null && !text.trim().isEmpty()) {
      return text.charAt(0);
    }
    return ' ';
  }
}
