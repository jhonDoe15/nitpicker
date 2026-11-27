package p;
class T {
    static Object viaK() { return K.get(); }
    static Object viaNew() { return new K(); }
}
class K3 {
    static { System.out.println("init"); }
    static Object get() { return null; }
    void m() { get(); }
    static void n() { get(); }
}
class Use2 {
    void a() { T.viaK(); T.viaNew(); }
}
