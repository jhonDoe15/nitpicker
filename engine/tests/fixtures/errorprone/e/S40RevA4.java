import org.jspecify.annotations.NonNull;
import org.jspecify.annotations.Nullable;

@SuppressWarnings("ClassCanBeStatic")
abstract class S40RevA4 {
  @interface Ann { @Nullable int a(); }
  @interface Ann2 { @Nullable @NonNull String b(); }
  @interface Ann3 { @Nullable int[] c(); }
  enum E { @Nullable @NonNull A }
  class In2 { In2(@Nullable @NonNull S40RevA4 S40RevA4.this) {} }
  record R2(@Nullable @NonNull int a) {}
  record R3(@Nullable int[] d) {}
  void f() {
    for (@Nullable var q : new int[0]) {}
    Object o4 = new @Nullable int[3];
  }
}
