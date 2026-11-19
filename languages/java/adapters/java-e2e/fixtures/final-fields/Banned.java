package demo;

import java.util.ArrayList;
import java.util.List;

public class Banned {
  private final int id;
  private String name; // violation: FieldCanBeFinal
  private int size; // violation: FieldCanBeFinal
  private List<String> items = new ArrayList<>(); // violation: FieldCanBeFinal
  private String label; // violation: FieldCanBeFinal
  private int second; // violation: FieldCanBeFinal
  private static String home = System.getProperty("user.home"); // violation: FieldCanBeFinal
  private static int limit; // violation: FieldCanBeFinal
  @Deprecated private int legacy; // violation: FieldCanBeFinal
  @SuppressWarnings("rawtypes") private List raw; // violation: FieldCanBeFinal

  static {
    limit = 8;
  }

  {
    label = "none";
  }

  public Banned(int id, String name) {
    this.id = id;
    this.name = name;
    size = name.length();
    this.second = id;
    this.legacy = 1;
    this.raw = new ArrayList();
  }

  public Banned(int id) {
    this(id, "unnamed");
  }

  public static class Pair {
    private int left; // violation: FieldCanBeFinal

    public Pair(int left, int right) {
      this.left = left;
      first(right);
    }

    private static void first(int value) {}
  }

  public int total() {
    return id + size + items.size() + second + limit + legacy + raw.size() + home.length();
  }

  public int sum(int second) {
    second = second + 1;
    return second;
  }
}
