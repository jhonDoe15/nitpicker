package p;
class G {
    static { C.get(); }
    static { D.get(); }
    static Object v = E.get();
    static void m() { C.get(); }
}
class H {
    static Object own() { return null; }
    static { own(); }
    static { new F().inst(); }
}
