public class A { static void m(){} static void o(){} static native void n(); }
class B extends A {
    static native void nat(int x);
    static void m() {
    }
    static native void n();
    static void o() {
    }
}
class C extends A {
    static void o() {
    }
}
