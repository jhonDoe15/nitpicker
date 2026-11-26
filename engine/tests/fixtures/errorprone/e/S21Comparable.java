import java.io.File;
import java.util.Comparator;

class S21ComparableBoth implements Comparable<S21ComparableBoth>, Comparator<S21ComparableBoth> {
  @Override
  public int compareTo(S21ComparableBoth other) {
    return 0;
  }

  @Override
  public int compare(S21ComparableBoth a, S21ComparableBoth b) {
    return 0;
  }
}

class S21ComparableSuper implements Comparator<S21ComparableSuper> {
  @Override
  public int compare(S21ComparableSuper a, S21ComparableSuper b) {
    return 0;
  }
}

class S21ComparableSub extends S21ComparableSuper implements Comparable<S21ComparableSub> {
  @Override
  public int compareTo(S21ComparableSub o) {
    return 0;
  }
}

class S21ComparableInherited extends S21ComparableBoth {}

interface S21ComparableInterface<T> extends Comparable<T>, Comparator<T> {}

interface S21ComparableInterfaceSub extends S21ComparableInterface<String> {}

record S21ComparableRecord(int x) implements Comparable<S21ComparableRecord>, Comparator<S21ComparableRecord> {
  @Override
  public int compareTo(S21ComparableRecord o) {
    return 0;
  }

  @Override
  public int compare(S21ComparableRecord a, S21ComparableRecord b) {
    return 0;
  }
}

enum S21ComparableEnum implements Comparator<Integer> {
  MONDAY;

  @Override
  public int compare(Integer one, Integer two) {
    return 0;
  }
}

class S21ComparableOnly implements Comparable<S21ComparableOnly> {
  private static final Comparator<S21ComparableOnly> COMPARATOR =
      new Comparator<S21ComparableOnly>() {
        @Override
        public int compare(S21ComparableOnly a, S21ComparableOnly b) {
          return 0;
        }
      };

  @Override
  public int compareTo(S21ComparableOnly o) {
    return 0;
  }
}

@SuppressWarnings("ComparableAndComparator")
class S21ComparableSuppressed implements Comparable<S21ComparableSuppressed>, Comparator<S21ComparableSuppressed> {
  @Override
  public int compareTo(S21ComparableSuppressed other) {
    return 0;
  }

  @Override
  public int compare(S21ComparableSuppressed a, S21ComparableSuppressed b) {
    return 0;
  }
}

class S21BadComparable implements Comparable<S21BadComparable> {
  private final long value = 0;
  private final Long boxed = Long.valueOf(0);
  private final int small = 0;

  @Override
  public int compareTo(S21BadComparable other) {
    return (int) (value - other.value);
  }

  public int boxed(S21BadComparable other) {
    return (int) (boxed - other.boxed);
  }

  static class Boxed implements Comparable<Boxed> {
    private final Long value = Long.valueOf(0);

    @Override
    public int compareTo(Boxed other) {
      return (int) (value - other.value);
    }
  }

  static final Comparator<Number> UNBOXED =
      new Comparator<Number>() {
        @Override
        public int compare(Number n1, Number n2) {
          return (int) (n1.longValue() - n2.longValue());
        }
      };

  static final Comparator<Long> BOXED =
      new Comparator<Long>() {
        @Override
        public int compare(Long n1, Long n2) {
          return (int) (n1 - n2);
        }
      };

  static final Comparator<File> FILES =
      new Comparator<File>() {
        @Override
        public int compare(File lhs, File rhs) {
          return (int) ((rhs.lastModified() - lhs.lastModified()));
        }
      };

  static final Comparator<Integer> MIXED =
      new Comparator<Integer>() {
        @Override
        public int compare(Integer a, Integer b) {
          return (int) (a - (long) b);
        }
      };

  static final Comparator<Number> NOT_NARROWING =
      new Comparator<Number>() {
        @Override
        public int compare(Number n1, Number n2) {
          return (int) (n1.intValue() - n2.intValue());
        }

        public short compare(int n1, int n2) {
          return (short) (n1 - n2);
        }

        public long compare(long n1, long n2) {
          return (long) (n1 - n2);
        }

        public int compare(long n1, long n2, long n3) {
          return (int) (n1 - n2);
        }

        int compare(Object n1, long n2) {
          return (int) (n2 - n2);
        }
      };

  static final Object NOT_COMPARATOR =
      new Object() {
        public int compare(Long n1, Long n2) {
          return (int) (n1 - n2);
        }
      };

  int notInMethod() {
    return (int) (value - 1L);
  }

  @SuppressWarnings("BadComparable")
  public int compareToSuppressed(S21BadComparable other) {
    return (int) (value - other.value);
  }
}

class S21NotComparable {
  private final long value = 0;

  public int compareTo(S21BadComparable other) {
    return (int) (value - 1);
  }
}
