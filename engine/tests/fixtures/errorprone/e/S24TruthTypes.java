package e;

import static com.google.common.truth.Truth.assertThat;
import static com.google.common.truth.TruthJUnit.assume;

import com.google.common.collect.ImmutableList;
import com.google.common.collect.Multimap;
import com.google.common.collect.Multiset;
import com.google.common.truth.Correspondence;
import com.google.common.truth.extensions.proto.ProtoTruth;
import com.google.protobuf.Message;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

class S24TruthTypes {
  static final class A {}

  static final class B {}

  static class Base {}

  static class Derived extends Base {}

  static final class Other extends Base {}

  void equality(A a, B b, Exception e, long l, Integer boxed) {
    assertThat(a).isEqualTo(b);
    assertThat(a).isNotEqualTo(b);
    assume().that(a).isEqualTo(b);
    assertThat(a).isEqualTo(a);
    assertThat("a").isEqualTo("b");
    assertThat(2L).isEqualTo(2);
    assertThat(Byte.valueOf((byte) 2)).isEqualTo(2);
    assertThat(l).isEqualTo(boxed);
    assertThat((Object) a).isEqualTo(b);
    assertThat(a).isEqualTo((Object) b);
    assertThat((Object) a).isEqualTo((Object) b);
    assertThat(new Derived()).isEqualTo(new Other());
    assertThat(new Derived()).isEqualTo(new Base());
    assertThat(1).isEqualTo("a");
    assertThat("a").isEqualTo(1);
    assertThat(true).isEqualTo("a");
    assertThat(a).isEqualTo(null);
  }

  @SuppressWarnings("TruthIncompatibleType")
  void suppressed(A a, B b) {
    assertThat(a).isEqualTo(b);
  }

  void anyOf(A a, B b, Object o) {
    assertThat(a).isAnyOf(a, b);
    assertThat(a).isNoneOf(b, a, b);
    assertThat(a).isAnyOf(a, o);
  }

  void isIn(A a, ImmutableList<B> bs, List<A> as, Map<String, Integer> map) {
    assertThat(a).isIn(bs);
    assertThat(a).isNotIn(bs);
    assertThat(a).isIn(as);
    assertThat("a").isIn(map.keySet());
  }

  void iterables(Iterable<Long> xs, String x, Number n, Number... ns) {
    assertThat(xs).contains(x);
    assertThat(xs).contains(n);
    assertThat(xs).doesNotContain(x);
    assertThat(xs).containsAnyOf(n, x);
    assertThat(xs).containsNoneOf(1L, x);
    assertThat(xs).containsAtLeast(1L, x, 2L);
    assertThat(xs).containsExactly(x, 1L);
    assertThat(xs).containsExactly((Object[]) ns);
    assertThat(xs).containsExactlyElementsIn(ImmutableList.of(x));
    assertThat(xs).containsExactlyElementsIn(ImmutableList.of(n));
    assertThat(xs).containsAnyIn(ImmutableList.of(x));
    assertThat(xs).containsNoneIn(ImmutableList.of(x));
    assertThat(xs).containsAtLeastElementsIn(ImmutableList.of(x));
  }

  void arrays(Iterable<Long> xs, String[] strings, Long[] longs, long[] primitive, Iterable<byte[]> bytes, byte[] ys) {
    assertThat(xs).containsExactlyElementsIn(strings);
    assertThat(xs).containsExactlyElementsIn(longs);
    assertThat(xs).containsAnyIn(strings);
    assertThat(bytes).containsExactly(ys);
    assertThat(xs).containsExactly(strings);
  }

  void varargs(Iterable<Long> xs, String... x) {
    assertThat(xs).containsExactly(x);
    assertThat(xs).containsExactlyElementsIn((Object[]) x);
  }

  void generics(List<? extends Number> numbers, List<? super Integer> supers, ArrayList<String> strings, List raw) {
    assertThat(numbers).contains("a");
    assertThat(numbers).contains(1);
    assertThat(supers).contains("a");
    assertThat(strings).contains(1);
    assertThat(raw).contains("a");
  }

  <T extends Number> void typeVariables(List<T> ts, T t, String s) {
    assertThat(ts).contains(s);
    assertThat(ts).contains(t);
    assertThat(t).isEqualTo(s);
  }

  void correspondence(Iterable<String> xs, Correspondence<Integer, String> bad, Correspondence<String, Integer> good, Correspondence<Object, Object> any) {
    assertThat(xs).comparingElementsUsing(bad);
    assertThat(xs).comparingElementsUsing(good);
    assertThat(xs).comparingElementsUsing(any);
  }

  void maps(Map<String, Integer> map, Multimap<String, Integer> multimap, Map<Integer, String> other, Multimap<Integer, String> otherMulti, Multiset<String> multiset) {
    assertThat(map).containsEntry(1, "a");
    assertThat(map).containsEntry("a", 1);
    assertThat(map).doesNotContainEntry(1, 1);
    assertThat(map).containsKey(1);
    assertThat(map).doesNotContainKey(1);
    assertThat(map).containsExactly("a", "b", "c", 3);
    assertThat(map).containsExactly("a", 1);
    assertThat(map).containsAtLeast("a", "b");
    assertThat(map).containsExactlyEntriesIn(other);
    assertThat(map).containsAtLeastEntriesIn(other);
    assertThat(multimap).containsEntry(1, "a");
    assertThat(multimap).containsKey(1);
    assertThat(multimap).containsExactlyEntriesIn(otherMulti);
    assertThat(multiset).hasCount(1, 2);
    assertThat(multiset).hasCount("a", 2);
    assertThat(multiset).contains(1);
  }

  void protos(Message m, Message other, A a) {
    ProtoTruth.assertThat(m).isEqualTo(a);
    ProtoTruth.assertThat(m).ignoringFieldAbsence().isEqualTo("a");
    ProtoTruth.assertThat(m).ignoringFields(1).isEqualTo(other);
    ProtoTruth.assertThat(m).isEqualTo(other);
  }
}
