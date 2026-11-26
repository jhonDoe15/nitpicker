package e;

import static com.google.common.truth.Truth.assertThat;

import com.google.common.base.Objects;
import com.google.common.truth.Correspondence;
import java.util.HashMap;
import java.util.Map;
import java.util.Random;

class S12Calls {
  void randomCast() {
    int x = (int) new Random().nextFloat();
    x = (int) new Random().nextDouble();
    long y = (long) new Random().nextFloat();
    y = (long) new Random().nextDouble();
    y = (long) (new Random().nextDouble());
    int z = (int) Math.random();
    z = (int) ((Math.random()));
    float f = new Random().nextFloat();
    f = (float) new Random().nextDouble();
    double d = new Random().nextFloat();
    d = new Random().nextDouble();
    d = Math.random();
    int i = (int) new Random().nextInt();
    i = (int) new Random().nextLong();
    long l = (long) new Random().nextInt();
    l = (long) new Random().nextLong();
    short s = (short) new Random().nextDouble();
    double e = (double) Math.random();
    int w = (int) (Math.random() * 10);
  }

  @SuppressWarnings("RandomCast")
  int randomCastSuppressed() {
    return (int) Math.random();
  }

  void randomMod(Random r) {
    System.err.println(r.nextInt() % 100);
    System.err.println(r.nextInt(100));
    System.err.println(new Random().nextInt() % 7);
    System.err.println(r.nextLong() % 100);
    System.err.println(r.nextInt() / 100);
    System.err.println((r.nextInt()) % 100);
    int m = 10;
    System.err.println(r.nextInt() % (m + 1));
    System.err.println(r.nextInt() % m + 1);
    System.err.println(r.nextInt(5) % 3);
  }

  @SuppressWarnings("RandomModInteger")
  int randomModSuppressed(Random r) {
    return r.nextInt() % 3;
  }

  void builders() {
    new StringBuilder('a');
    new StringBuilder('"');
    new StringBuilder('\n');
    new StringBuilder('\'');
    new StringBuilder('\\');
    new StringBuilder('é');
    char c = 'c';
    new StringBuilder(c);
    StringBuilder sb = new StringBuilder(c);
    new StringBuilder("a");
    new StringBuilder(5);
    new StringBuilder();
    new StringBuilder(c + 1);
    new StringBuilder((char) 65);
    new StringBuffer('a');
    new StringBuilder("a" + c);
  }

  @SuppressWarnings("StringBuilderInitWithChar")
  Object buildersSuppressed() {
    return new StringBuilder('a');
  }

  @SuppressWarnings("deprecated")
  void deprecatedOne() {}

  @SuppressWarnings({"deprecated"})
  void deprecatedArray() {}

  @SuppressWarnings({"deprecated", "foobarbaz"})
  void deprecatedMore() {}

  @SuppressWarnings({"foobarbaz", "deprecated"})
  void deprecatedSecond() {}

  void deprecatedLocal() {
    @SuppressWarnings({"deprecated", "foobarbaz"})
    int a = 3;
    @SuppressWarnings("deprecated")
    int b = 3;
    @SuppressWarnings("deprecated")
    class Foo {}
    @SuppressWarnings({"deprecated", "foobarbaz"})
    class Bar {}
  }

  @SuppressWarnings(value = {"deprecated"})
  void deprecatedValueArray() {}

  @SuppressWarnings(value = "deprecated")
  void deprecatedValue() {}

  @SuppressWarnings("deprecation")
  void deprecationOk() {}

  @SuppressWarnings({"deprecation", "unchecked"})
  void deprecationOkMore() {}

  @SuppressWarnings("unchecked")
  void uncheckedOk() {}

  @java.lang.SuppressWarnings("deprecated")
  void qualified() {}

  @SuppressWarnings({"deprecated", "deprecated"})
  void twice() {}

  @SuppressWarnings({"a", "deprecated", "b", "deprecated"})
  void middle() {}

  protected String simpleField;

  public boolean selfEquals1(Object obj) {
    if (obj == null || getClass() != obj.getClass()) {
      return false;
    }
    S12Calls other = (S12Calls) obj;
    return simpleField.equals(simpleField);
  }

  public boolean selfEquals2(S12Calls obj) {
    S12Calls other = (S12Calls) obj;
    return simpleField.equals(this.simpleField);
  }

  public boolean selfEquals3(S12Calls obj) {
    S12Calls other = (S12Calls) obj;
    return this.simpleField.equals(simpleField);
  }

  public boolean selfEquals4(S12Calls obj) {
    S12Calls other = (S12Calls) obj;
    return this.simpleField.equals(this.simpleField);
  }

  public boolean selfEquals5(Object obj) {
    S12Calls other = (S12Calls) obj;
    return equals(this);
  }

  public boolean selfEqualsNoLocal(Object obj) {
    return simpleField.equals(simpleField);
  }

  public void asserts(S12Calls obj) {
    org.junit.Assert.assertSame(obj, obj);
    assertThat(obj.equals(obj)).isTrue();
    assertThat(obj).isEqualTo(obj);
    assertThat(obj).isNotEqualTo(obj);
  }

  public boolean selfEqualsLocal(S12Calls sc) {
    return sc.equals(sc);
  }

  public <T> boolean selfEqualsGeneric(T t) {
    int y = 0;
    return t.equals(t);
  }

  public boolean shadowed(String simpleField) {
    return this.simpleField.equals(simpleField);
  }

  public boolean shadowedStatic(String simpleField) {
    return Objects.equal(this.simpleField, simpleField);
  }

  public boolean thisThis() {
    return Objects.equal(this, this);
  }

  public boolean otherReceiver(S12Calls x, S12Calls y) {
    return x.simpleField.equals(y.simpleField) || x.simpleField.equals(x.simpleField);
  }

  public boolean notSelfEquals(S12Calls a, S12Calls b) {
    return a.equals(b) || Boolean.TRUE.toString().equals(Boolean.FALSE.toString());
  }

  public boolean guava() {
    S12Calls other = new S12Calls();
    boolean retVal;
    retVal = Objects.equal(simpleField, simpleField);
    retVal &= Objects.equal(simpleField, this.simpleField);
    retVal &= Objects.equal(this.simpleField, simpleField);
    retVal &= Objects.equal(this.simpleField, this.simpleField);
    return retVal;
  }

  public static void guavaNested() {
    ForTesting tester = new ForTesting();
    Objects.equal(tester.testing.testing, tester.testing.testing);
    Objects.equal(tester, tester);
    Objects.equal(tester.string, tester.string);
  }

  private static class ForTesting {
    public ForTesting testing;
    public String string;
  }

  Object a = new Object();
  boolean b = Objects.equal(a, a);

  boolean c = a.equals(a);

  @SuppressWarnings("SelfEquals")
  boolean suppressedSelfEquals(Object o) {
    return o.equals(o);
  }

  @SuppressWarnings("SelfEquals")
  boolean suppressedSelfEquals() {
    return Objects.equal(a, a);
  }

  boolean notGuava(Object o, Object p) {
    return Objects.equal(o, p);
  }

  static class Cmp implements Comparable<Object> {
    private String field;
    private Cmp obj = new Cmp();

    @Override
    public int compareTo(Object o) {
      return 0;
    }

    int test1() {
      Cmp local = new Cmp();
      return local.compareTo(local);
    }

    int test2() {
      return obj.compareTo(this.obj);
    }

    int test3() {
      return this.obj.compareTo(obj);
    }

    int test4() {
      return this.obj.compareTo(this.obj);
    }

    int test5() {
      return compareTo(this);
    }

    int test6() {
      return this.compareTo(this);
    }

    int shadow(Cmp obj) {
      return this.obj.compareTo(obj);
    }

    int negative(Object other) {
      return field.compareTo(((Cmp) other).field);
    }

    int negative2() {
      return Boolean.TRUE.toString().compareTo(Boolean.FALSE.toString());
    }

    int negative3(String a, String b) {
      return a.compareTo(b);
    }

    int negative4(String a) {
      return a.compareTo("x");
    }

    @SuppressWarnings("SelfComparison")
    int suppressed(String a) {
      return a.compareTo(a);
    }

    int stringSelf(String a) {
      return a.compareTo(a);
    }

    int integerSelf(Integer a) {
      return a.compareTo(a);
    }
  }

  private static final Map map = new HashMap<String, String>();
  private static final Map<String, String> typed = new HashMap<String, String>();

  public void evenArgs(Object... args) {
    assertThat(map).containsExactly("hello", "there", "rest");
    assertThat(map).containsExactly("hello", "there", "hello", "there", "rest");
    assertThat(map).containsExactly(null, null, null, null, new Object[] {});
    assertThat(typed).containsExactly("hello", "there", "rest");
    String key = "hello";
    Object[] value = new Object[] {};
    Object[][] arrays = new Object[][] {};
    assertThat(map).containsExactly(key, value, (Object) arrays);
    assertThat(map)
        .comparingValuesUsing(Correspondence.from((a, b) -> true, "dummy"))
        .containsExactly("hello", "there", "rest");
    assertThat(map)
        .comparingValuesUsing(Correspondence.from((a, b) -> true, "dummy"))
        .containsExactly("hello", "there", "hello", "there", "rest");
    assertThat(map).containsExactly();
    assertThat(map).containsExactly("hello", "there");
    assertThat(map).containsExactly("hello", "there", "hello", "there");
    assertThat(map).containsExactly("hello", args);
    assertThat(map).containsExactly("hello", "world", args);
    String[] arg = {"hello", "there"};
    assertThat(map).containsExactly("yolo", arg);
    assertThat(map).containsExactly(key, value);
    assertThat(map).containsExactly(key, value, (Object[]) arrays);
    assertThat(map).containsExactly(key, value, key, value, key, value);
    assertThat(map)
        .comparingValuesUsing(Correspondence.from((a, b) -> true, "dummy"))
        .containsExactly("hello", "there");
  }

  @SuppressWarnings("ShouldHaveEvenArgs")
  void evenArgsSuppressed() {
    assertThat(map).containsExactly("hello", "there", "rest");
  }
}
