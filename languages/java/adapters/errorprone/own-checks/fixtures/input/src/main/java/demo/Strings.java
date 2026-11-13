package demo;

public class Strings {
  boolean literals(String name, Object other) {
    return name.equals("a") || name.equalsIgnoreCase("b") || "c".equals(name) || other.equals("d");
  }

  boolean concatenated(String left, String right) {
    return (left + right).equals("e");
  }
}
