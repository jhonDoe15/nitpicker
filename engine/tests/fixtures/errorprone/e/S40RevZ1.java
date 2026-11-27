import org.jspecify.annotations.NonNull;
import org.jspecify.annotations.Nullable;

@SuppressWarnings("ClassCanBeStatic")
class S40RevZ1 {
  @interface Ann { @Nullable @NonNull int a() default 1; @Nullable int[] b(); int @Nullable @NonNull [] c(); }
  enum E { @Nullable @NonNull A, @Nullable B }
  class In { In(@Nullable @NonNull S40RevZ1 S40RevZ1.this) {} }
  void recv(@Nullable @NonNull S40RevZ1 this, int x) {}
  void recv2(@Nullable S40RevZ1 this) {}
  void f(Object x) {
    for (@Nullable var q : new int[0]) {}
    for (@Nullable @NonNull var r : new String[0]) {}
    Object o = new @Nullable int[3];
    Object o2 = new @Nullable @NonNull String[3];
    Object o3 = new @Nullable @NonNull int @Nullable [] {};
  }
  record R3(@Nullable int[] d, @Nullable int e, int @Nullable [] f) {}
  void h(String @Nullable /* c */ @NonNull ... s) {}
  void i(int @Nullable /* c */ ... s) {}
  void j(String @Nullable // c
      @NonNull ... s) {}
}
