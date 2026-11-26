package e;

import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.junit.Assert;

class S11Calls {
  List<Integer> a = new ArrayList<Integer>();
  List<Integer> c = new ArrayList<Integer>();
  Object field;

  void assertSame(Object obj, Object other) {
    org.junit.Assert.assertSame(obj, obj);
    org.junit.Assert.assertSame("message", obj, obj);
    junit.framework.Assert.assertSame(obj, obj);
    junit.framework.Assert.assertSame("message", obj, obj);
    Assert.assertSame(field, field);
    Assert.assertSame(this.field, this.field);
    Assert.assertSame(field, this.field);
    org.junit.Assert.assertSame(obj, other);
    org.junit.Assert.assertSame("message", obj, other);
    junit.framework.Assert.assertSame(obj, other);
    Assert.assertSame(obj.toString(), obj.toString());
  }

  @SuppressWarnings("JUnitAssertSameCheck")
  void assertSameSuppressed(Object obj) {
    org.junit.Assert.assertSame(obj, obj);
  }

  int[] lossy = {
    Double.compare(0L, 0L),
    Double.compare(Long.valueOf(0L), 0L),
    Double.compare((byte) 0, (byte) 0),
    Double.compare((short) 0, (short) 0),
    Double.compare('0', '0'),
    Double.compare(0, 0),
    Double.compare(0.f, 0.f),
    Double.compare(0.0, 0.0),
    Float.compare(0L, 0L),
    Float.compare(Long.valueOf(0L), 0L),
    Float.compare(0, 0),
    Float.compare(0, Integer.valueOf(0)),
    Float.compare((byte) 0, (byte) 0),
    Float.compare((short) 0, (short) 0),
    Float.compare('0', '0'),
    Float.compare(0.f, 0.f),
    Float.compare(0, 1L),
  };

  void round(Integer i, long l, Long boxed, Float f, Double d, short s) {
    int y = Math.round(3);
    int z = Math.round(i);
    int w = Math.round(l);
    int v = Math.round(boxed);
    int u = Math.round(l / 2);
    int t = Math.round(1 + 3) * 3;
    int r = Math.round(i + 1);
    int q = Math.round(f);
    long p = Math.round(d);
    int o = Math.round(s);
    int n = Math.round(-i);
    int m = Math.round((int) l);
    Math.round(i);
  }

  static class Foo {
    Object get() {
      return null;
    }

    Object execute() {
      return null;
    }
  }

  Object mockito() {
    Foo foo = mock(Foo.class);
    when(foo.get()).thenThrow();
    doThrow().when(foo).get();
    when(foo.get()).thenThrow(new IllegalStateException());
    doThrow(new IllegalStateException()).when(foo).get();
    when(foo.get()).thenReturn(null);
    verify(foo).execute();
    verify(foo, never());
    verify(foo.execute(), never());
    when(foo.get());
    verify(foo.execute());
    verify(foo);
    verify(foo.execute(), times(1));
    Object result = verify(foo.execute());
    return result;
  }

  void nCopies() {
    Collections.nCopies(' ', 10);
    Collections.nCopies(10, ' ');
    Collections.nCopies('a', Integer.valueOf(3));
    Collections.nCopies(Character.valueOf('a'), 3);
    Collections.nCopies(2, "a");
    Collections.nCopies('a', 'b');
    List<Character> list = Collections.nCopies(3, 'c');
  }

  @Retention(RetentionPolicy.SOURCE)
  @interface SourceOnly {}

  @interface NotSpecified {}

  @Retention(RetentionPolicy.CLASS)
  @interface ClassRetained {}

  @Retention(RetentionPolicy.RUNTIME)
  @interface Runtime {}

  void nonRuntime(Class<?> any) {
    S11Calls.class.getAnnotation(SourceOnly.class);
    S11Calls.class.getAnnotation(NotSpecified.class);
    S11Calls.class.getAnnotation(ClassRetained.class);
    S11Calls.class.getAnnotation(Runtime.class);
    this.getClass().getAnnotation(SourceOnly.class);
    any.getAnnotation(Runtime.class);
    any.getAnnotation(Deprecated.class);
    any.getAnnotation(java.lang.annotation.Documented.class);
  }

  public void addAll(List<Integer> b) {
    this.a.addAll(a);
    a.addAll(1, a);
  }

  public void containsAll(List<Integer> b) {
    this.a.containsAll(this.a);
    a.containsAll(this.a);
  }

  public void retainAll(List<Integer> a) {
    a.retainAll(a);
  }

  public void removeAll() {
    this.a.removeAll(a);
    a.removeAll(a);
  }

  static class HasOneField {
    List<Integer> a;

    void removeAll() {
      a.removeAll(a);
    }

    void testParameterFirst(List<Integer> b) {
      b.removeAll(b);
    }

    void expressionStatementChecks() {
      boolean b = 2 == 2 && a.containsAll(a);
      b = a.retainAll(a);
      b = a.removeAll(a);
    }

    void localList() {
      List<Integer> mine = new ArrayList<>();
      mine.addAll(mine);
      mine.retainAll(mine);
    }
  }

  public boolean fine(List<Integer> b) {
    boolean r = a.addAll(b);
    r |= a.removeAll(b);
    r |= a.retainAll(b);
    r |= a.containsAll(b);
    r |= a.addAll(1, b);
    return r;
  }

  @SuppressWarnings("ModifyingCollectionWithItself")
  void suppressed() {
    a.addAll(a);
  }
}
