import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Predicate;

public class B3Equals {
  class A {}

  class B {}

  void checkEqualsAB(A a, B b) {
    a.equals(b);
    b.equals(a);
    a.equals(a);
    a.equals(null);
  }

  class C {}

  abstract class C1 extends C {
    public abstract boolean equals(Object o);
  }

  abstract class C2 extends C1 {}

  abstract class C3 extends C {}

  void checkEqualsCC1C2C3(C c, C1 c1, C2 c2, C3 c3) {
    c3.equals(c1);
    c3.equals(c2);
    c1.equals(c3);
    c2.equals(c3);
    c.equals(c1);
    c1.equals(c);
  }

  void checkStatic(C c, C1 c1, C3 c3) {
    Objects.equals(c3, c1);
    Objects.equals(c1, c3);
    Objects.equals(c, c1);
  }

  void primitives(int a, long b, Long boxed, Integer i, Object o, String s) {
    Objects.equals(a, b);
    Objects.equals(b, a);
    boxed.equals(a);
    i.equals(a);
    o.equals(a);
    s.equals(a);
    i.equals(boxed);
  }

  interface I {
    boolean equals(Object o);
  }

  class D {}

  class D1 extends D {}

  class D2 extends D implements I {}

  void checkEqualsDD1D2(D d, D1 d1, D2 d2) {
    d1.equals(d2);
    d2.equals(d1);
    d.equals(d1);
  }

  void collections(List<String> stringList, List<Integer> intList, Set<String> stringSet, Set<Integer> intSet, List rawList, ArrayList<String> arrayList, HashSet<String> hashSet) {
    stringList.equals(intList);
    stringSet.equals(intSet);
    stringList.equals(stringSet);
    rawList.equals(stringList);
    stringList.equals(arrayList);
    arrayList.equals(hashSet);
  }

  void maps(Map<String, Integer> a, Map<Integer, String> b, Map<List<String>, Set<String>> c, Map<List<String>, Set<Integer>> d) {
    a.equals(b);
    c.equals(d);
  }

  void nested(Set<List<String>> setListString, Set<List<Integer>> setListInteger) {
    boolean equals = setListString.equals(setListInteger);
  }

  class MyGenericClazz<T> {}

  void generics(MyGenericClazz<String> strClazz, MyGenericClazz<Integer> intClazz) {
    strClazz.equals(intClazz);
  }

  final class FinalBuilder {}

  final class FinalBuilderWithEquals {
    @Override
    public boolean equals(Object o) {
      return true;
    }
  }

  class OpenBuilder {}

  enum SomeBuilder {
    ONE
  }

  void builders(FinalBuilder one, FinalBuilder two, FinalBuilderWithEquals three, FinalBuilderWithEquals four, OpenBuilder five, OpenBuilder six, SomeBuilder seven) {
    one.equals(two);
    three.equals(four);
    five.equals(six);
    seven.equals(SomeBuilder.ONE);
  }

  void predicate(String s, Integer i) {
    Predicate<String> p = Predicate.isEqual(s);
    Predicate<String> q = Predicate.isEqual(i);
  }

  void assertions(A a, B b) {
    assertFalse(a.equals(b));
    assertFalse("message", a.equals(b));
  }

  void assertFalse(boolean b) {}

  void assertFalse(String s, boolean b) {}

  void array(int[] ints, long[] longs, String[] strings, Object[] objects, Object o) {
    ints.equals(longs);
    strings.equals(objects);
    strings.equals(ints);
    ints.equals(o);
  }

  @SuppressWarnings("EqualsIncompatibleType")
  void quiet(A a, B b) {
    a.equals(b);
  }

  @Override
  public boolean equals(Object other) {
    return this.equals((B3Equals) other) || super.equals(other) || equals(new A());
  }
}
