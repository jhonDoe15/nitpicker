package rapi;

import com.google.errorprone.annotations.RestrictedApi;

public class Lib implements Api {
  static final String WHY = "local " + "reason";

  @RestrictedApi(explanation = "no-arg constructor", allowlistAnnotations = Allow.class, allowlistWithWarningAnnotations = {Warn.class})
  public Lib() {}

  @RestrictedApi(explanation = "int constructor", allowlistAnnotations = {Allow.class, Allow.Nested.class}, link = "https://example.com/int")
  public Lib(int value) {}

  public Lib(String value) {
    this();
  }

  public Lib(long value) {
    this((int) value);
  }

  @RestrictedApi(explanation = WHY, allowlistAnnotations = {Allow.class})
  public int instance() {
    return 1;
  }

  @RestrictedApi(explanation = Reasons.PREFIX + "call " + Reasons.CODE, allowlistAnnotations = {})
  public static int statics() {
    return 2;
  }

  @RestrictedApi(explanation = Reasons.SHARED, allowedOnPath = ".*/rapi/allowed/.*")
  public static void pathed() {}

  @RestrictedApi(explanation = "pathed by name", allowedOnPath = ".*/rapi/(use|allowed)/[A-Z]\\w*Path\\.java")
  public static void named() {}

  @RestrictedApi(explanation = "never on a path", allowedOnPath = "rapi/use/.*")
  public static void relative() {}

  @RestrictedApi(explanation = "generic")
  public static <T> T same(T value) {
    return value;
  }

  @RestrictedApi(explanation = "varargs")
  public static void many(String... values) {}

  @RestrictedApi(explanation = "both", allowlistAnnotations = Allow.class, allowlistWithWarningAnnotations = Allow.class)
  public static void both() {}

  @RestrictedApi(explanation = "")
  public static void empty() {}

  @RestrictedApi(explanation = "inheritable", allowlistAnnotations = Kept.class)
  public static void inheritable() {}

  @Override
  public void api() {}

  public int plain() {
    return 0;
  }

  public static void accept(Runnable runnable) {}

  public static void supply(java.util.function.Supplier<Object> supplier) {}

  public class Member {
    @RestrictedApi(explanation = "inner constructor")
    public Member() {}
  }

  public static class Sub extends Lib {
    @Allow
    public Sub(int value) {
      super(value);
    }

    public Sub(short value) {
      super(value);
    }

    public Sub() {}

    @Override
    public int instance() {
      return 3;
    }

    public static int statics() {
      return 4;
    }

    void calls() {
      instance();
      super.instance();
      this.instance();
    }
  }
}

interface Api {
  @RestrictedApi(explanation = "interface", link = "nothing")
  void api();
}

enum Kind {
  FIRST,
  SECOND(1),
  THIRD(2) {
  },
  @Allow
  FOURTH,
  FIFTH {
  },
  @Deprecated
  SIXTH(3),
  @Allow
  SEVENTH(4) {
    void inside() {
      Lib.statics();
    }
  };

  @RestrictedApi(explanation = "enum constructor", allowlistAnnotations = Allow.class)
  Kind() {}

  @RestrictedApi(explanation = "enum int constructor")
  Kind(int value) {}
}
