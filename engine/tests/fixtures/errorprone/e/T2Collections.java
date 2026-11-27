package e;

import com.google.common.base.Optional;
import com.google.common.collect.ClassToInstanceMap;
import com.google.common.collect.Sets;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Deque;
import java.util.Dictionary;
import java.util.HashMap;
import java.util.Hashtable;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.Stack;
import java.util.Vector;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentNavigableMap;
import java.util.concurrent.ConcurrentSkipListMap;
import java.util.function.BiFunction;

public class T2Collections {
  public void collection(Collection<Integer> collection1, Collection<String> collection2) {
    collection1.contains("bad");
    collection1.remove("bad");
    collection1.containsAll(collection2);
    collection1.removeAll(collection2);
    collection1.retainAll(collection2);
  }

  public void collectionSubtype(ArrayList<Integer> arrayList1, ArrayList<String> arrayList2) {
    arrayList1.contains("bad");
    arrayList1.remove("bad");
    arrayList1.containsAll(arrayList2);
    arrayList1.removeAll(arrayList2);
    arrayList1.retainAll(arrayList2);
  }

  public boolean deque(Deque<Integer> deque) {
    boolean result = deque.removeFirstOccurrence("bad");
    return result && deque.removeLastOccurrence("bad");
  }

  public boolean dequeSubtype(LinkedList<Integer> linkedList) {
    boolean result = linkedList.removeFirstOccurrence("bad");
    return result && linkedList.removeLastOccurrence("bad");
  }

  public String dictionary(Dictionary<Integer, String> dictionary) {
    String result = dictionary.get("bad");
    return result + dictionary.remove("bad");
  }

  public String dictionarySubtype(Hashtable<Integer, String> hashtable) {
    String result = hashtable.get("bad");
    return result + hashtable.remove("bad");
  }

  public int list() {
    List<String> list = new ArrayList<String>();
    int result = list.indexOf(1);
    return result + list.lastIndexOf(1);
  }

  public boolean map() {
    Map<Integer, String> map = new HashMap<>();
    String result = map.get("bad");
    result = map.getOrDefault("bad", "soBad");
    boolean result2 = map.containsKey("bad");
    result2 = map.containsValue(1);
    result = map.remove("bad");
    return result2;
  }

  public boolean mapSubtype() {
    ConcurrentNavigableMap<Integer, String> concurrentNavigableMap = new ConcurrentSkipListMap<>();
    String result = concurrentNavigableMap.get("bad");
    boolean result2 = concurrentNavigableMap.containsKey("bad");
    result2 = concurrentNavigableMap.containsValue(1);
    result = concurrentNavigableMap.remove("bad");
    return result2;
  }

  public int stack(Stack<Integer> stack) {
    return stack.search("bad");
  }

  private static class MyStack<E> extends Stack<E> {}

  public int stackSubtype(MyStack<Integer> myStack) {
    return myStack.search("bad");
  }

  public int vector(Vector<Integer> vector) {
    int result = vector.indexOf("bad", 0);
    return result + vector.lastIndexOf("bad", 0);
  }

  private static class Date {}

  public boolean sameSimpleNames(Collection<java.util.Date> collection1, Collection<Date> collection2) {
    return collection1.contains(new Date());
  }

  public boolean boundedWildcard() {
    Collection<? extends java.util.Date> collection = new ArrayList<>();
    return collection.contains("bad");
  }

  private static class Pair<A, B> {
    public A first;
    public B second;
  }

  public boolean declaredTypeVsExpressionType(Pair<Integer, String> pair, List<Integer> list) {
    return list.contains(pair.second) || list.contains(pair.first);
  }

  public String subclassHasDifferentTypeParameters(ClassToInstanceMap<String> map, String s) {
    return map.get(s);
  }

  private static class MyArrayList extends ArrayList<Integer> {}

  public void subclassWithDifferentTypeParameters(Collection<String> collection, MyArrayList myArrayList) {
    collection.containsAll(myArrayList);
  }

  private static class IncompatibleBounds<K extends String, V extends Number> {
    private boolean function(Map<K, V> map, K key) {
      return map.containsValue(key);
    }
  }

  interface Interface {}

  interface Interface2 {}

  private static final class FinalClass1 {}

  private static final class FinalClass2 {}

  private static class NonFinalClass1 {}

  private static class NonFinalClass2 {}

  public boolean finals(Collection<Interface> c1, FinalClass1 f1, Collection<FinalClass1> c2, Interface i, Collection<NonFinalClass1> c3, NonFinalClass2 n2, FinalClass2 f2, Collection<Interface2> c4) {
    return c1.contains(f1) || c2.contains(i) || c3.contains(n2) || c2.contains(f2) || c3.contains(f1) || c2.contains(new NonFinalClass1())
        || c4.contains(i) || c1.contains(n2) || c3.contains(i);
  }

  public boolean negatives(Collection<String> c, Collection<?> any, Collection raw, Collection<Class<? extends String>> classes, Class<?> clazz, Optional<?> optional, Object o) {
    return c.contains("ok") || c.contains(null) || any.contains(1) || raw.contains(1) || classes.contains(clazz) || c.contains(optional.get()) || c.contains(o);
  }

  public <T extends String> T classToken(ClassToInstanceMap<String> map, Class<T> klass) {
    return klass.cast(map.get(klass));
  }

  public boolean hashtableContains(Hashtable<Integer, String> hashtable, ConcurrentHashMap<Integer, String> concurrentHashMap) {
    return hashtable.contains(1) || concurrentHashMap.contains(1);
  }

  private static class MyHashMap<K extends Integer, V extends String> extends HashMap<K, V> {}

  public boolean boundedTypeParameters(MyHashMap<?, ?> myHashMap) {
    return myHashMap.containsKey(1) || myHashMap.containsKey("bad") || myHashMap.containsValue(1);
  }

  public void typeArguments(Collection<Number> n, Collection<Integer> i, Collection<? extends Number> en, Collection<? extends Integer> ei, Collection<String> s) {
    n.containsAll(i);
    i.containsAll(n);
    en.containsAll(ei);
    i.containsAll((Collection<?>) s);
    s.containsAll(en);
  }

  public void classTokens(Set<Class<? extends Iterable<?>>> iterables, Class<ArrayList> arrayListClass, Set<Class<? extends Number>> numbers, Class<String> strings) {
    iterables.contains(arrayListClass);
    numbers.contains(strings);
  }

  public void superWildcards(Collection<? super Integer> c, List<? super String> l) {
    c.contains("x");
    l.contains(1);
  }

  public void printing(Collection<Integer> c, String a, Object o, int i) {
    c.contains(a + "x" + "y");
    c.contains("x" + "y");
    c.contains((String) o);
    c.contains(a.trim());
    c.contains(new StringBuilder("a"));
    c.contains(i > 0 ? "a" : "b");
    c.contains(/* comment */ a);
    c.contains(
        a
            .trim());
    c.contains('c');
    c.contains(1L);
    c.contains(1.5f);
    c.contains(new String[] {"a"});
  }

  public void statics(List<String> a, List<Integer> b, List<?> c, Set<String> d, Set<Integer> e, Set<?> f) {
    Collections.disjoint(a, a);
    Collections.disjoint(a, b);
    Collections.disjoint(c, b);
    Sets.difference(d, d);
    Sets.difference(d, e);
    Sets.difference(f, e);
  }

  java.util.stream.Stream<Integer> filter(List<Integer> xs, List<String> ss, List<Object> os) {
    xs.stream().filter(os::contains);
    return xs.stream().filter(ss::contains);
  }

  void removeAll(List<List<Integer>> xs, List<String> ss) {
    xs.forEach(ss::removeAll);
  }

  <T extends String, M extends Integer> void boundedFunction(BiFunction<Set<T>, Set<M>, Set<T>> b) {}

  <T extends String, M extends T> void dependentFunction(BiFunction<Set<T>, Set<M>, Set<T>> b) {}

  void concreteFunction(BiFunction<Set<Integer>, Set<String>, Set<Integer>> b) {}

  void compatibleFunction(BiFunction<Set<Integer>, Set<Number>, Set<Integer>> b) {}

  void references() {
    boundedFunction(Sets::difference);
    dependentFunction(Sets::difference);
    concreteFunction(Sets::difference);
    compatibleFunction(Sets::difference);
  }

  static void wildcardBounded(Set<? extends List<Integer>> xs, Set<? extends Set<Integer>> ys) {
    xs.containsAll(ys);
  }

  static class OwnMap<K, V> extends HashMap<K, V> {
    void test(K k, V v) {
      get(k);
      get(v);
      this.get(v);
      super.get(v);
    }
  }

  static class Numbers<N extends Number> extends ArrayList<N> {
    @Override
    public boolean contains(Object o) {
      return super.contains(o);
    }

    void test(N n) {
      contains("x");
      this.contains("y");
      super.contains("z");
      contains(n);
    }
  }

  static class Ints extends ArrayList<Integer> {
    void test() {
      contains("x");
      this.contains("y");
      super.contains("z");
    }
  }

  <C extends Collection<String>, T extends Integer> void variables(C c, T t, List<T> ts, Map<T, C> m) {
    c.contains(1);
    c.contains(t);
    ts.contains("s");
    m.get("k");
    m.containsValue(c);
    m.containsValue(t);
  }

  @SuppressWarnings("CollectionIncompatibleType")
  void suppressed(List<String> s) {
    s.contains(1);
  }

  void generics(List<List<String>> lists, List<Integer> ints, List<? extends Number> numbers, Map<String, List<String>> map) {
    lists.contains(ints);
    lists.contains(numbers);
    map.containsValue(ints);
    map.containsValue(lists.get(0));
  }
}
