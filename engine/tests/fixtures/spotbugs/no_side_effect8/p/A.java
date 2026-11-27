package p;
class C {
    private static final Object d = new Object();
    static Object get() { return d; }
}
class D {
    static Object get() { return null; }
}
class E {
    private static final Object d = "x";
    static Object get() { return d; }
}
class F {
    private static Object d;
    static { d = new Object(); }
    static Object get() { return d; }
    Object inst() { return d; }
}
public class A {
    void a() { C.get(); }
    void b() { D.get(); }
    void c() { E.get(); }
    void d() { F.get(); }
    void e(F f) { f.inst(); }
}
