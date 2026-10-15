package shop.smells;

public final class Parameters implements Comparable<Parameters> {
  private final int size;

  public Parameters(int size) {
    this.size = size;
  }

  public int total(int count, int extra) { // violation: UnusedFormalParameter
    return count + size;
  }

  @Handler
  public int handle(IllegalStateException failure) {
    return size;
  }

  @Override
  public int compareTo(Parameters other) {
    return 0;
  }

  public int skipped(int ignoredValue) {
    return size;
  }

  public static void main(String[] args) {
    new Parameters(1).total(1, 2);
  }
}
