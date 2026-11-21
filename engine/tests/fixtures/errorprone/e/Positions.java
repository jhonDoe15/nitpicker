package e;

import java.lang.annotation.ElementType;
import java.lang.annotation.Target;
import java.util.List;

public abstract class Positions {
  @Target(ElementType.TYPE_USE) @interface T {}
  @Target({ElementType.TYPE_USE, ElementType.FIELD, ElementType.METHOD, ElementType.PARAMETER, ElementType.LOCAL_VARIABLE}) @interface B {}
  @Target(ElementType.FIELD) @interface F {}
  @interface D {}
  @Target(ElementType.TYPE_PARAMETER) @interface P {}
  @Target({ElementType.TYPE_USE, ElementType.TYPE}) @interface TT {}

  public @D int a;
  @T public int b;
  public @T int c;
  @B public int d;
  public @B int e;
  public @F int f;
  public @D @F static int g;
  @T @D public int h;
  public @D @T int i;
  @D /** Doc after annotation. */ int j;
  /** Real. */ @D /** Doc after annotation. */ int k;
  @D /* plain */ int l;
  @D /** Doc. */ public int m;
  public @D /** Doc. */ int n;
  @D int /** after type */ o;

  public @D Positions() {}
  @T public List<String> list() { return null; }
  public @T List<String> list2() { return null; }
  public <X> @T X gen() { return null; }
  @T public <X> X gen2() { return null; }
  public @D <X> X gen3() { return null; }
  @D public static void s() {}
  public @D static void s2() {}
  @D /** doc */ void s3() {}
  @D /** doc */ Positions(int x) {}
  @D /** doc */ Positions(long x) { int y = 1; }
  @D Positions(/** doc */ String x) {}

  void params(final @D int p, @D final int q, final @T String r) {
    final @D int local = 1;
    @T final String local2 = "";
    @D var v = 1;
    final @D var w = 1;
    java.util.function.Function<String, String> fn = (final @D String z) -> z;
    try (final @D java.io.StringReader sr = new java.io.StringReader("")) {
    } catch (final @D Exception ex) {
    }
  }

  public @D static class Inner {}
  @D public static class Inner2 {}
  static public @D @TT class Inner3 {}
  @D /** Doc */ class Inner4 { int x; }
  @D /** Doc */ class Inner5 {}
  @D /** Doc */ class Inner6<Q> {}
  public @D enum En { @D /** doc */ X, Y }
  public @D sealed interface Se permits Im {}
  final @D class Im implements Se {}
  public @D record Re(@D int a, @T int b) {}
  abstract @D void ab();
  @D @Deprecated public @T @SuppressWarnings("x") String mixed() { return null; }
}
