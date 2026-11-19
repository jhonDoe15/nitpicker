package shop.comparators;

public class Key implements Comparable<Key> {
  private final int line;
  private final int column;
  private final long stamp;

  public Key(int line, int column, long stamp) {
    this.line = line;
    this.column = column;
    this.stamp = stamp;
  }

  @Override
  public int compareTo(Key other) {
    return line - other.line; // violation: SubtractionComparison
  }

  public int compareColumn(Key other) {
    return column - other.column;
  }

  public int compareStamp(Key other) {
    return Long.compare(stamp, other.stamp);
  }
}

class Stamp implements Comparable<Stamp> {
  private final long time;

  Stamp(long time) {
    this.time = time;
  }

  @Override
  public int compareTo(Stamp other) {
    return (int) (time - other.time);
  }
}

class Identity implements Comparable<Identity> {
  @Override
  public int compareTo(Identity other) {
    return System.identityHashCode(this) - System.identityHashCode(other);
  }
}

class Ranked implements Comparable<Ranked> {
  private final int rank;

  Ranked(int rank) {
    this.rank = rank;
  }

  @Override
  public int compareTo(Ranked other) {
    return rank > 0 ? rank - other.rank : 0; // violation: SubtractionComparison
  }
}
