import java.util.ArrayList;
import java.util.List;

class S23ParamName {
  void f(int foo, int bar) {}

  void target(Object param1, Object param2) {}

  void single(Object param) {}

  void many(Object... param) {}

  void varargs(int... args) {}

  void uni(int größe) {}

  void first(int first, int... rest) {}

  class Inner {
    Inner(int foo, int bar) {}
  }

  static class Foo {
    Foo(int foo, int bar) {}
  }

  S23ParamName() {
    this(/* bar= */ 1);
  }

  S23ParamName(int foo) {
    this(/* foo= */ 1, /* bar= */ 2);
  }

  S23ParamName(int foo, int bar) {
    super();
  }

  void positive() {
    f(/* bar= */ 1, /* foo= */ 2);
    f(
        /** bar= */
        3,
        /** foo= */
        4);
    f(/* foo= */ 1, 2);
    target(/* param2= */ 1, 2);
    target(/* notMatching= */ 1, 2);
    target(/* param2= */ 2, /* param1= */ 1);
    target(/* y= *//* z= */ 1, 2);
    single(/* param = */ 1);
    single(/* param= */ 1);
    single(/*note param = */ 1);
    single(/*param*/ 1);
    single(1 /*param*/);
    single(1); // param
    single(
        // newX =
        //   (x ^ 2)
        1 * 1);
    many(/* param.!.= */ 1);
    varargs(/* argh...= */ 1, 2, 3);
    varargs(/* args...= */ 1, 2);
    varargs(/* args= */ 1, 2);
    varargs(1, /* args...= */ 2);
    varargs(1, /* x= */ 2, /* y */ 3);
    first(/* first= */ 1);
    first(/* second= */ 1);
    int[] ints = {1, 2};
    varargs(/* args...= */ ints);
    varargs(/* args= */ ints);
    new Foo(/* bar= */ 1, /* foo= */ 2);
    new Foo(/* bar= */ 1, /* foo= */ 2) {};
    new Foo(/* foo= */ 1, /* bar= */ 2) {};
    new S23ParamName().new Inner(/* bar= */ 1, /* foo= */ 2);
    new S23ParamName().new Inner(/* foo= */ 1, /* bar= */ 2);
    List<String> list = new ArrayList<>();
    list.add(/* foo= */ "a");
    String.valueOf(/* y= */ 1);
    Math.max(/* a= */ 1, /* b= */ 2);
    uni(/* gro= */ 1);
    uni(/* größe= */ 1);
    uni(/*\u00a0größe= */ 1);
    uni(/* größe\u00a0= */ 1);
    uni(/* größe=
     */ 1);
    target(/// param2=
        1, 2);
    f(/* bar= */ 1 + 2, /* foo= */ g(3));
  }

  int g(int x) {
    return x;
  }

  @SuppressWarnings("ParameterName")
  void suppressed() {
    f(/* bar= */ 1, /* foo= */ 2);
  }
}
