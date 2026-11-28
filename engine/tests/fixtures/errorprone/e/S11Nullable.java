package e;

import static java.lang.annotation.ElementType.PARAMETER;
import static java.lang.annotation.ElementType.TYPE_PARAMETER;
import static java.lang.annotation.ElementType.TYPE_USE;

import java.lang.annotation.Target;
import java.util.List;

@SuppressWarnings("NullAway")
class S11Nullable {
  @Target(TYPE_USE)
  @interface Nullable {}

  @Target(TYPE_USE)
  @interface Anno {}

  @Target({PARAMETER, TYPE_USE})
  @interface Both {}

  @Target(PARAMETER)
  @interface ParamOnly {}

  @Target({TYPE_USE, TYPE_PARAMETER})
  @interface NonNull {}

  class B {}

  static class C {}

  void test(@Nullable S11Nullable.B x) {}

  void test2(List<@Nullable S11Nullable.B> x) {}

  void test3(S11Nullable.@Nullable B x) {}

  void test4(@NonNull S11Nullable.B x) {}

  void test5(List<@NonNull S11Nullable.B> x) {}

  void test6(@Anno S11Nullable.B x) {}

  void test7(S11Nullable.@Anno B x) {}

  void test8(@Both S11Nullable.C x) {}

  void test9(@ParamOnly S11Nullable.C x) {}

  void test10(@Nullable B x) {}

  void test11(@Nullable String x) {}


  @Nullable S11Nullable.B method() {
    return null;
  }

  @Nullable S11Nullable.B field;


  @SuppressWarnings("NullableOnContainingClass")
  void quiet(@Nullable S11Nullable.B x) {}

  abstract static class Inner implements List<@Nullable S11Nullable.B> {}
}
