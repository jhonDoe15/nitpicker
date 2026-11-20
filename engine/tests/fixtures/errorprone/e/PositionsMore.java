package e;

import java.lang.annotation.ElementType;
import java.lang.annotation.Target;
import java.util.List;
import java.util.Map;

abstract class PositionsMore {
  @Target(ElementType.TYPE_USE) @interface T {}
  @Target({ElementType.TYPE_USE, ElementType.METHOD, ElementType.CONSTRUCTOR, ElementType.FIELD, ElementType.PARAMETER}) @interface B {}
  @interface D {}
  @Target(ElementType.TYPE_PARAMETER) @interface N {}

  public @T PositionsMore() {}
  @T PositionsMore(int x) {}
  public @B PositionsMore(long x) {}
  public @D int x1, x2;
  @Deprecated public @D <K extends Map<K, List<K>>> K deep() { return null; }
  public <K extends Map<K, List<K>>> @T K deep2() { return null; }
  public final @java.lang.Deprecated void qualified() {}
  public @e.PositionsMore.D void qualified2() {}
  public @PositionsMore.D void qualified3() {}
  @D public @interface Inner {}
  public @D @interface Inner2 { @D public int v(); public @D String w() default ""; }
  public @D interface I { @D default void m() {} default @D void n() {} }
  sealed interface S permits Q {}
  public @D non-sealed class Q implements S {}
  record R(int a) {
    @D public R {
      if (a < 0) throw new IllegalArgumentException();
    }
  }
  record R2(int a) {
    public @D R2 {
      /** inside body */
    }
  }
  record R3(int a) {
    @D R3 {
      /** inside body */
      int b = a;
    }
  }
  record R4() {
    @D R4 {
      int b = 1;
      /** later */
    }
  }
  public @SafeVarargs final void va(String... s) {}
  void params(final @D String... args) {}
  @D
  /** Javadoc on next line. */
  void nextLine() {}
  /** ok */
  @D
  /** Javadoc twice. */
  void twice() {}
  @D /* not javadoc */ /** javadoc */ static void mixed() {}
  enum E {
    A, B;
    public @D void m() {}
    @D /** doc */ E() {}
  }
  public @D static final String S1 = "x", S2 = "y";
  public @B String both() { return null; }
  @B public String both2() { return null; }
  public static @B void voidBoth() {}
  @SuppressWarnings("AnnotationPosition") public @D int suppressed;
  void locals() {
    for (final @D String s : List.of("a")) {}
    for (final @D int i = 0, j = 1; i < 1; ) { break; }
    Object o = null;
    if (o instanceof final @D String str) {}
  }
}
