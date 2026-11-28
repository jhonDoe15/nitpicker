package e;

import java.io.Serializable;
import java.util.Comparator;

class S9ComparableType {
  public static class CompareClass implements Comparable<Integer> {
    @Override
    public int compareTo(Integer o) {
      return 0;
    }
  }

  public static class SerializableComparable implements Serializable, Comparable<Long> {
    @Override
    public int compareTo(Long o) {
      return 0;
    }
  }

  public static class ComparableSerializable implements Comparable<Long>, Serializable {
    @Override
    public int compareTo(Long o) {
      return 0;
    }
  }

  public static class BadClass implements Comparable<Double>, Comparator<Double> {
    @Override
    public int compareTo(Double o) {
      return 0;
    }

    @Override
    public int compare(Double o1, Double o2) {
      return 0;
    }
  }

  public static class AnotherBadClass implements Comparator<Double>, Comparable<Double> {
    @Override
    public int compareTo(Double o) {
      return 0;
    }

    @Override
    public int compare(Double o1, Double o2) {
      return 0;
    }
  }

  @SuppressWarnings({"rawtypes", "unchecked"})
  public static class Raw implements Comparable {
    @Override
    public int compareTo(Object o) {
      return 0;
    }
  }

  public static class Good implements Comparable<Good> {
    @Override
    public int compareTo(Good o) {
      return 0;
    }
  }

  public static class Generic<T> implements Comparable<Generic<T>> {
    @Override
    public int compareTo(Generic<T> o) {
      return 0;
    }
  }

  public static class GenericBad<T> implements Comparable<GenericBad<String>> {
    @Override
    public int compareTo(GenericBad<String> o) {
      return 0;
    }
  }

  public static class Sub extends Good implements Comparable<Good> {}

  public static class Parent<T extends Parent<T>> implements Comparable<T> {
    @Override
    public int compareTo(T o) {
      return 0;
    }
  }

  public static class Var<T> implements Comparable<T> {
    @Override
    public int compareTo(T o) {
      return 0;
    }
  }

  public static class Inner implements Comparable<S9ComparableType.Inner> {
    @Override
    public int compareTo(S9ComparableType.Inner o) {
      return 0;
    }
  }

  public static class Other implements Comparable<Good> {
    @Override
    public int compareTo(Good o) {
      return 0;
    }
  }

  public static class Strings implements Comparable<String[]> {
    @Override
    public int compareTo(String[] o) {
      return 0;
    }
  }

  public interface Iface extends Comparable<Integer> {}

  public enum En implements Comparable<En> {
    A
  }

  @SuppressWarnings("ComparableType")
  public static class Suppressed implements Comparable<Integer> {
    @Override
    public int compareTo(Integer o) {
      return 0;
    }
  }

  void anonymous() {
    Object o = new Comparable<String>() {
      @Override
      public int compareTo(String s) {
        return 0;
      }
    };
  }
}
