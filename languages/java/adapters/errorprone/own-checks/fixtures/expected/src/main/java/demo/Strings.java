package demo;

public class Strings {
  boolean literals(String name, Object other) {
    return "a".equals(name) || "b".equalsIgnoreCase(name) || "c".equals(name) || other.equals("d");
  }

  boolean concatenated(String left, String right) {
    return "e".equals(left + right);
  }
}
