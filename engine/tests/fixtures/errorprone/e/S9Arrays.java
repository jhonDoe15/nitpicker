package e;

import com.google.common.base.Objects;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.HashSet;
import java.util.Set;

class S9ArrayEquals {
  boolean ints() {
    int[] a = {1, 2, 3};
    int[] b = {1, 2, 3};
    boolean x = a.equals(b);
    boolean y = Objects.equal(a, b);
    boolean z = java.util.Objects.equals(a, b);
    return x && y && z;
  }

  boolean objects(Object[] a, Object[] b, Object c, int[] d) {
    boolean x = a.equals(b);
    boolean y = a.equals(c);
    boolean z = c.equals(a);
    boolean w = d.equals(a);
    boolean v = Arrays.equals(a, b);
    return x || y || z || w || v;
  }

  boolean calls(String s, char[] chars) {
    boolean x = s.toCharArray().equals(chars);
    boolean y = chars.equals(s.toCharArray());
    boolean z = s.toCharArray().equals(s.toCharArray());
    boolean w = (chars).equals(chars);
    return x || y || z || w;
  }

  @SuppressWarnings("ArrayEquals")
  boolean suppressed(int[] a, int[] b) {
    return a.equals(b);
  }
}

class S9ArraysAsList {
  void run(int[] ints, long[] longs, char[] chars, byte[] bytes, short[] shorts, float[] floats, double[] doubles, boolean[] booleans, String[] strings, int[][] nested) {
    Object a = Arrays.asList(ints);
    Object b = Arrays.asList(longs);
    Object c = Arrays.asList(chars);
    Object d = Arrays.asList(bytes);
    Object e = Arrays.asList(shorts);
    Object f = Arrays.asList(floats);
    Object g = Arrays.asList(doubles);
    Object h = Arrays.asList(booleans);
    Object i = Arrays.asList(strings);
    Object j = Arrays.asList(nested);
    Object k = Arrays.asList(1, 2);
    Object l = Arrays.asList(ints, ints);
    Object m = Arrays.asList(new int[] {1});
    Object n = java.util.Arrays.asList(ints).size();
  }

  @SuppressWarnings("ArraysAsListPrimitiveArray")
  Object suppressed(int[] ints) {
    return Arrays.asList(ints);
  }
}

class S9ToArray<T> {
  void run() {
    Collection<String> collection = new ArrayList<String>();
    Integer[] a = collection.toArray(new Integer[collection.size()]);
    Integer[] arrayOfInts = new Integer[10];
    Integer[] b = collection.toArray(arrayOfInts);
    Set<Integer> integerSet = new HashSet<Integer>();
    Long[] c = integerSet.toArray(new Long[10]);
    Set<Long> longSet = new HashSet<Long>();
    Integer[] d = longSet.toArray(new Integer[10]);
    Collection<Integer> collInts = new ArrayList<Integer>();
    Object[] e = collInts.toArray();
    Integer[] f = collInts.toArray(new Integer[collection.size()]);
    Collection<Object> objects = new ArrayList<>();
    Integer[] g = objects.toArray(new Integer[objects.size()]);
    Integer[] h = collInts.toArray(arrayOfInts);
    Collection<Collection<Integer>> nested = new ArrayList<Collection<Integer>>();
    Object[] i = nested.toArray(new ArrayList[10]);
    S9Some some = new S9Some();
    Integer[] j = some.toArray(new Integer[1]);
    Collection raw = new ArrayList();
    Object[] k = raw.toArray(new Integer[1]);
    String[] l = collection.toArray(new String[0]);
    Number[] m = collInts.toArray(new Number[0]);
    CharSequence[] n = collection.toArray(new CharSequence[0]);
    Comparable[] o = collection.toArray(new Comparable[0]);
    Runnable[] p = collection.toArray(new Runnable[0]);
  }

  void test(Foo<Integer> foo) {
    String[] things = foo.toArray(new String[] {});
  }

  void test(FooBar<Integer> foo) {
    Integer[] things = foo.toArray(new Integer[] {});
  }

  void ok(FooOk<Integer> fooOk, FooBarOk<Integer> fooBarOk) {
    Integer[] a = fooOk.toArray(new Integer[] {});
    String[] b = fooBarOk.toArray(new String[] {});
  }

  <C extends Collection<Integer>> void generic(C cx) {
    cx.toArray(new Integer[0]);
    cx.toArray(new String[0]);
  }

  @SuppressWarnings("CollectionToArraySafeParameter")
  void suppressed(Collection<String> collection) {
    collection.toArray(new Integer[0]);
  }

  class FooBar<U> extends HashSet<String> {}

  class Foo<U> extends HashSet<U> {}

  class FooOk<U> extends HashSet<U> {}

  class FooBarOk<U> extends HashSet<String> {}
}

class S9Some {
  Integer[] toArray(Integer[] someArray) {
    return new Integer[10];
  }
}

interface S9ToArrayOverload extends Collection<String> {
  void toArray(int[] a);

  default void f(int[] a) {
    toArray(a);
  }
}
