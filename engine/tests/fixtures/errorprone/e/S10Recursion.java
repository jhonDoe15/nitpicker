package e;

class S10Recursion {
  void f(int x) {}

  void f() {
    f();
  }

  int g() {
    return 0;
  }

  int g(int x) {
    return g(x);
  }

  void h() {
    this.h();
  }

  void i() {
    (this).i();
  }

  void j() {
    S10Recursion.this.j();
  }

  void k() {
    (e.S10Recursion.this).k();
  }

  S10Recursion m() {
    m();
    return this;
  }

  S10Recursion n() {
    new S10Recursion();
    n();
    return this;
  }

  static void s(int x) {}

  static void s() {
    S10Recursion.s();
  }

  static void instanceS() {
    new S10Recursion().instanceS();
  }

  static void subclassS() {
    Sub.subclassS();
  }

  static int t() {
    return 0;
  }

  static int t(int x) {
    return S10Recursion.t(x);
  }

  class Sub extends S10Recursion {}

  void ok(int x) {
    ok(42);
  }

  int ok2(int x) {
    return x == 0 ? ok2(0) : ok2(x - 1);
  }

  S10Recursion test;

  void delegate() {
    test.delegate();
  }

  void afterReturn(boolean again) {
    if (!again) {
      return;
    }
    afterReturn(false);
  }

  void beforeReturn(boolean again) {
    beforeReturn(false);
    if (!again) {
      return;
    }
  }

  void ifConditional(boolean again) {
    if (again) {
      ifConditional(false);
    }
  }

  void whileConditional(boolean again) {
    while (again) {
      whileConditional(false);
    }
  }

  void forConditional(int n) {
    for (int i = 0; i < n; i++) {
      forConditional(i);
    }
  }

  void forInit() {
    for (int i = 0; i < forInitHelper(); forInit()) {}
  }

  int forInitHelper() {
    return 1;
  }

  void each(java.util.List<String> l) {
    for (String s : l) {
      each(l);
    }
  }

  void eachExpression() {
    for (String s : eachExpressionList()) {}
  }

  java.util.List<String> eachExpressionList() {
    for (String s : eachExpressionList()) {}
    return null;
  }

  void switchStatement(CallAgain callAgain) {
    switch (callAgain) {
      case TRUE:
        switchStatement(CallAgain.FALSE);
    }
  }

  int switchExpression(CallAgain callAgain) {
    return switch (callAgain) {
      case TRUE -> switchExpression(CallAgain.FALSE) + 1;
      case FALSE -> 0;
    };
  }

  enum CallAgain {
    TRUE,
    FALSE,
  }

  void nestedClass() {
    new Object() {
      void g() {
        nestedClass();
      }
    };
  }

  void afterNestedClass() {
    new Object() {
      void g() {
        afterNestedClass();
        return;
      }
    };
    afterNestedClass();
  }

  Runnable lambda() {
    return () -> lambda();
  }

  <T> void generic(T x) {
    this.<String>generic("");
  }

  void withNull(Object x) {
    withNull(null);
  }

  String overrideThatReturnsObject() {
    return (String) overrideThatReturnsObject();
  }

  String castParens() {
    return (String) (castParens());
  }

  public void overload(String s) {
    overload((Object) s);
  }

  public void overload(Object o) {
    overload(o);
  }

  abstract static class Abstract {
    abstract void f();
  }

  S10Recursion next;
  boolean nextIsCool;

  boolean isCool(boolean thisIsCool) {
    return next.isCool(nextIsCool) || thisIsCool;
  }

  boolean isCoolRight(boolean thisIsCool) {
    return thisIsCool || next.isCoolRight(thisIsCool);
  }

  String asString() {
    return '{' + asString() + '}';
  }

  void catchAndReturn() {
    try {
      System.out.println("hi");
    } catch (Exception e) {
      return;
    }
    catchAndReturn();
  }

  void tryBody() {
    try {
      tryBody();
    } finally {
    }
  }

  void catchBody() {
    try {
      System.out.println();
    } catch (RuntimeException e) {
      catchBody();
    }
  }

  void synchronizedBlock() {
    synchronized (this) {
      synchronizedBlock();
    }
  }

  void labeled() {
    outer:
    {
      labeled();
    }
  }

  void doWhile(boolean b) {
    do {
      doWhile(b);
    } while (b);
  }

  boolean andRight(boolean b) {
    return b && andRight(b);
  }

  boolean orLeft(boolean b) {
    return orLeft(b) || b;
  }

  int arithmetic(int x) {
    return x + arithmetic(x);
  }

  void argument() {
    System.out.println(argumentValue());
  }

  int argumentValue() {
    System.out.println(argumentValue());
    return 1;
  }

  @SuppressWarnings("InfiniteRecursion")
  void suppressed() {
    suppressed();
  }

  S10Recursion() {
    new S10Recursion();
  }

  void ternaryCondition() {
    boolean b = ternaryConditionValue() ? true : false;
  }

  boolean ternaryConditionValue() {
    return ternaryConditionValue() ? true : false;
  }

  void returnInLambdaDoesNotCount() {
    Runnable r = () -> {
      return;
    };
    returnInLambdaDoesNotCount();
  }

  final void finalMethod() {
    other.finalMethod();
  }

  S10Recursion other;

  static void staticFromInstance(S10Recursion r) {
    r.staticFromInstance(r);
  }

  void ifElseReturn(boolean b) {
    if (b) {
      return;
    } else {
      System.out.println();
    }
    ifElseReturn(b);
  }

  void throwBeforeCall() {
    throw new IllegalStateException(String.valueOf(throwBeforeCallInt()));
  }

  int throwBeforeCallInt() {
    throw new IllegalStateException();
  }

  int getterRecursion() {
    return getterRecursion() + 1;
  }
}

final class S10FinalRecursion {
  S10FinalRecursion test;

  void f() {
    test.f();
  }

  void g(S10FinalRecursion other) {
    other.g(other);
  }

  void viaSuper() {
    String unused = super.toString();
  }
}

class S10Overridable {
  S10Overridable other;

  void f() {
    other.f();
  }

  private void p(S10Overridable x) {
    x.p(x);
  }

  static void q(S10Overridable x) {
    x.q(x);
  }
}
