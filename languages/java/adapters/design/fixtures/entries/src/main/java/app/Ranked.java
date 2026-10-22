package app;

public class Ranked implements Comparable<Ranked> {
  private final int rank = 1;

  public int compareTo(Ranked other) {
    return rank - other.rank;
  }

  public void other() {}

  private void internal() {}

  public static void util() {}
}
