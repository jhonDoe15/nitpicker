package p;
public class S extends SBase {
  class Inn { void f() { Runnable r2 = S.super::m; Runnable r3 = () -> {}; } }
  interface I { default void d() {} }
  interface J extends I { default void d() {} }
  static class K implements J { public void d() { Runnable r = J.super::d; Runnable r3 = () -> {}; } }
  static class K2 implements I { public void d() { Runnable r = I.super::d; Runnable r3 = () -> {}; } }
  void own() { Runnable a = S.super::m; Runnable b = super::m; Runnable c = () -> {}; }
}
class SBase { void m() {} }
