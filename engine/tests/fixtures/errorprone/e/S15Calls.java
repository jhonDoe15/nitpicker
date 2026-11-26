package e;

import static com.google.common.base.Preconditions.checkArgument;
import static com.google.common.base.Preconditions.checkNotNull;
import static com.google.common.base.Preconditions.checkState;
import static com.google.common.truth.Truth.assertThat;

import com.google.common.base.Throwables;
import com.google.common.base.Verify;
import com.google.common.collect.FluentIterable;
import com.google.common.collect.Iterables;
import com.google.common.collect.Lists;
import com.google.common.collect.Multimap;
import com.google.common.collect.Sets;
import com.google.common.reflect.Invokable;
import com.google.common.truth.Correspondence;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.FileNotFoundException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.BitSet;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeoutException;
import java.util.stream.Stream;

class S15Calls {
  String join(List<String> list, CharSequence sequence, String... many) {
    String a = String.join(",");
    String b = String.join(",", "x");
    String c = String.join(",", sequence);
    String d = String.join(",", list);
    String e = String.join(",", "x", "y");
    String f = String.join(",", many);
    String g = String.join(",", (CharSequence) null);
    return a + b + c + d + e + f + g;
  }

  @SuppressWarnings("StringJoin")
  String joinSuppressed() {
    return String.join(",");
  }

  static class Holder {
    List<Integer> intList = new ArrayList<>();

    List<Integer> getIntList() {
      return intList;
    }
  }

  static class HasSize {
    int size() {
      return 0;
    }
  }

  static class SizedList extends ArrayList<String> {
    boolean unqualified() {
      return size() >= 0;
    }

    boolean unqualifiedTwo() {
      return 0 <= size();
    }
  }

  boolean sizes(
      List<Integer> intList,
      Set<Integer> intSet,
      Map<String, String> map,
      Collection<String> collection,
      Holder baz,
      String string,
      CharSequence chars,
      StringBuilder builder,
      StringBuffer buffer,
      BitSet bits,
      int[] array,
      long[][] arrays,
      Multimap<String, String> multimap,
      FluentIterable<String> fluent,
      ByteArrayOutputStream stream,
      android.util.SparseArray<String> sparse,
      Iterable<String> iterable) {
    boolean foo = intList.size() >= 0;
    foo = intSet.size() >= 0;
    foo = 0 <= intSet.size();
    foo = map.size() >= 0;
    foo = collection.size() >= 0;
    foo = new ArrayList<Integer>().size() >= 0;
    foo = baz.intList.size() >= 0;
    foo = baz.getIntList().size() >= 0;
    foo = string.length() >= 0;
    foo = "My String Literal".length() >= 0;
    foo = string.trim().substring(0).length() >= 0;
    foo = chars.length() >= 0;
    foo = builder.length() >= 0;
    foo = 0 <= buffer.length();
    foo = bits.length() >= 0;
    foo = array.length >= 0;
    foo = 0 <= arrays.length;
    foo = arrays[0].length >= 0;
    foo = multimap.size() >= 0;
    foo = fluent.size() >= 0;
    foo = stream.size() >= 0;
    foo = sparse.size() >= 0;
    foo = Iterables.size(iterable) >= 0;
    foo = 0 <= Iterables.size(iterable);
    foo = (((((new HasSize()))))).size() >= 0;
    foo = (intList.size()) >= 0;
    foo = intList.size() >= 0x0;
    foo = intList.size() >= 00;
    foo = intList.size() >= 0b0;
    foo = intList.size() >= 0L;
    foo = intList.size() > 0;
    foo = intSet.size() >= 1;
    foo = collection.size() <= 0;
    foo = collection.size() == 0;
    foo = collection.size() < 0;
    foo = new HasSize().size() >= 0;
    foo = 0 >= intList.size();
    foo = string.indexOf("a") >= 0;
    foo = new SizedList().size() >= 0;
    return foo;
  }

  @SuppressWarnings("SizeGreaterThanOrEqualsZero")
  boolean sizesSuppressed(List<Integer> list) {
    return list.size() >= 0;
  }

  void throwIf(
      Throwable throwable,
      Exception exception,
      RuntimeException runtime,
      IOException io,
      Error error) {
    try {
      if (System.nanoTime() > 0) {
        throw new IOException();
      }
    } catch (IOException e) {
      Throwables.throwIfUnchecked(e);
      Throwables.propagateIfPossible(e);
    } catch (RuntimeException e) {
      Throwables.throwIfUnchecked(e);
    } catch (Exception e) {
      Throwables.throwIfUnchecked(e);
    } catch (Throwable t) {
      Throwables.throwIfUnchecked(t);
    }
    Throwables.throwIfUnchecked(throwable);
    Throwables.throwIfUnchecked(exception);
    Throwables.throwIfUnchecked(runtime);
    Throwables.throwIfUnchecked(io);
    Throwables.throwIfUnchecked(error);
    Throwables.propagateIfPossible(io);
    Throwables.propagateIfPossible(new FileNotFoundException());
  }

  <T extends IOException> void throwIfVariable(T value) {
    Throwables.throwIfUnchecked(value);
  }

  void throwIfUnion() {
    try {
      if (System.nanoTime() > 0) {
        throw new IOException();
      }
      throw new TimeoutException();
    } catch (IOException | TimeoutException e) {
      Throwables.throwIfUnchecked(e);
    }
    try {
      System.out.println();
    } catch (IllegalStateException | IllegalArgumentException e) {
      Throwables.throwIfUnchecked(e);
    }
  }

  @SuppressWarnings("ThrowIfUncheckedKnownChecked")
  void throwIfSuppressed(IOException io) {
    Throwables.throwIfUnchecked(io);
  }

  void placeholders(int a, String s) {
    checkArgument(a > 0, "%s is bad", a);
    checkArgument(a > 0, "%d is bad", a);
    checkArgument(a > 0, "%d is bad and %s too", a, s);
    checkArgument(a > 0, "%s and %d", a, s);
    checkArgument(a > 0, "%d and %d", a);
    checkArgument(a > 0, "%d", a, s);
    checkArgument(a > 0, "%d", a, s, a);
    checkArgument(a > 0, "{0} is bad", a);
    checkArgument(a > 0, "{0} {1}", a, s);
    checkArgument(a > 0, "$s is odd", a);
    checkArgument(a > 0, "%1$s is odd", a);
    checkArgument(a > 0, "no placeholders", a);
    checkArgument(a > 0, "no placeholders");
    checkArgument(a > 0, "%s ok", a);
    checkArgument(a > 0, "%s %s ok", a);
    checkArgument(a > 0, "%s" + "%d", a, s);
    checkArgument(a > 0, s, a);
    checkState(a > 0, "%d is bad", a);
    checkState(a > 0, "%x", a);
    checkNotNull(s, "%d is null", a);
    checkNotNull(s, "%s is null", a);
    checkNotNull(s, "%d is null");
    Verify.verify(a > 0, "%d is bad", a);
    Verify.verifyNotNull(s, "%d is bad", a);
  }

  @SuppressWarnings("PreconditionsInvalidPlaceholder")
  void placeholdersSuppressed(int a) {
    checkArgument(a > 0, "%d is bad", a);
  }

  void locks(Object lock) throws InterruptedException {
    Integer boxed = 1;
    Boolean flag = true;
    synchronized (boxed) {
    }
    synchronized (flag) {
      flag = false;
    }
    synchronized (lock) {
    }
    synchronized (Integer.valueOf(1)) {
    }
    synchronized ((boxed)) {
    }
    boxed.wait();
    boxed.wait(1);
    boxed.wait(1L, 2);
    boxed.notify();
    boxed.notifyAll();
    flag.hashCode();
    lock.wait();
    lock.notifyAll();
  }

  static class FieldLocks {
    private Integer count = 0;
    private Boolean flag;
    private final Long stamp = 1L;
    Short one, two;

    void a() {
      synchronized (count) {
        count++;
      }
    }

    void b() {
      synchronized (this.count) {
        count++;
      }
      synchronized (flag) {
        flag = true;
      }
      synchronized (stamp) {
      }
    }

    void c() {
      synchronized (two) {
      }
      synchronized (one) {
      }
    }
  }

  static class LateField {
    void use() {
      synchronized (late) {
      }
    }

    @Deprecated
    private Character late = 'x';
  }

  @SuppressWarnings("LockOnBoxedPrimitive")
  void locksSuppressed(Integer boxed) throws InterruptedException {
    synchronized (boxed) {
    }
    boxed.wait();
  }

  void varargs(Invokable<Object, Object> invokable, Correspondence<String, String> strings, Correspondence<Object, Object> objects, List<String> list) throws Exception {
    assertThat(list).containsExactly(null);
    assertThat(list).containsExactly((Object[]) null);
    assertThat(list).containsExactly((String[]) null);
    assertThat(list).containsExactly((Object) null);
    assertThat(list).containsExactly(null, null);
    assertThat(list).containsExactly("a");
    assertThat(list).containsExactly();
    assertThat(list.stream()).containsExactly(null);
    assertThat(list).containsAnyOf("a", "b", null);
    assertThat(list).containsAnyOf("a", "b", (Object[]) null);
    assertThat(list).containsAtLeast("a", "b", (String[]) null);
    assertThat(list).containsNoneOf("a", "b", null);
    assertThat(list).containsAnyOf("a", "b", (Object) null);
    assertThat(list).containsAnyOf("a", "b", "c");
    assertThat(list).isAnyOf("a", "b", null);
    assertThat(list).isNoneOf("a", "b", (Object[]) null);
    invokable.invoke(null, null);
    invokable.invoke(null, (Object[]) null);
    invokable.invoke(null, (Object) null);
    invokable.invoke(null);
    assertThat(list).comparingElementsUsing(strings).containsExactly(null);
    assertThat(list).comparingElementsUsing(strings).containsExactly((String[]) null);
    assertThat(list).comparingElementsUsing(objects).containsExactly(null);
    assertThat(list).comparingElementsUsing(strings).containsAnyOf("a", "b", null);
    assertThat(list).comparingElementsUsing(strings).containsAtLeast("a", "b", (String[]) null);
    assertThat(list).comparingElementsUsing(strings).containsNoneOf("a", "b", (String[]) null);
  }

  void generic(String s) {
    List<String> a = Arrays.asList(null);
    List<String> b = Arrays.asList((String[]) null);
    List<Object> c = Arrays.asList((String[]) null);
    var d = Arrays.asList(null);
    var e = Arrays.<String>asList(null);
    var f = Arrays.<Integer[]>asList((Integer[][]) null);
    List<Integer[]> g = Arrays.asList((Integer[][]) null);
    Stream<String> h = Stream.of(null);
    List<String> i = Lists.newArrayList((String[]) null);
    Set<String> j = Sets.newHashSet(null);
    Iterable<String> k = Iterables.cycle(null);
    List<Object> l = Arrays.asList((Object) null);
    List<String> m = Arrays.asList("a", null);
    List<String> n = Arrays.asList();
    List<Number> o = Arrays.asList((Integer[]) null);
    List<String> p = Arrays.asList(s, null);
    List<String> q = Arrays.asList((String) null);
    System.out.println(Arrays.asList(null));
  }

  @SuppressWarnings("NullNeedsCastForVarargs")
  void varargsSuppressed(List<String> list) {
    assertThat(list).containsExactly(null);
  }

  void escapedSpaces() {
    String a = "a\s";
    String b = "a\sb";
    String c = "\s\sb";
    String d = "a\s\s";
    String e = "a b\s";
    String f = "ab\s";
    String g = "\sa b";
    String h = "a \s" + "b";
    String i = "x" + "y\s";
    String j = "x\s" + "y z";
    String k = "x z " + "y\s";
    char l = '\s';
    char m = ' ';
    String n = """
        a\s
        b c\s\s
        d\se
        """;
    String o = """
        trailing\s
          ok
        mid\sdle f
        """;
    String p = "q \\s";
    String q = "q \\\s";
    String r = "q\s\n";
  }

  @SuppressWarnings("MisleadingEscapedSpace")
  String escapedSuppressed() {
    return "a \sb";
  }
}
