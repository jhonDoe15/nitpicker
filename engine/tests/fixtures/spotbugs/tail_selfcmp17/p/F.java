package p;

public class F {
    int f; static int s; F o; G gg; java.util.List<String> list;
    void pure() { }
    int reads() { return f; }
    static void spure() { }
    static int sreads() { return s; }
    void callsJdkPure() { String.valueOf(1); }
    void callsStatic() { spure(); }
    final void finalPure() { }
    int readsO() { return o.f; }
    void pureArg(F a) { }
    private void privPure() { }
    F returnsNew() { return new F(); }
    void callsPrivate() { privPure(); }
    int listSize() { return list.size(); }
    void localArray() { int[] a = new int[2]; a[0] = 1; }
    void writesO() { o.f = 1; }
    void writesArg(F a) { a.f = 1; }
    boolean b1() { int x = s; int y = s; reads(); return x == y; }
    boolean b2() { int x = o.f; int y = o.f; o.pure(); return x == y; }
    boolean b3() { int x = o.f; int y = o.f; pure(); return x == y; }
    boolean b4() { int x = f; int y = f; callsJdkPure(); return x == y; }
    boolean b5() { int x = f; int y = f; callsStatic(); return x == y; }
    boolean b6() { int x = f; int y = f; finalPure(); return x == y; }
    boolean b7() { int x = f; int y = f; readsO(); return x == y; }
    boolean b8() { int x = f; int y = f; o.reads(); return x == y; }
    boolean b9() { int x = f; int y = f; pureArg(o); return x == y; }
    boolean b10() { int x = o.f; int y = o.f; pureArg(o); return x == y; }
    boolean b11() { int x = f; int y = f; gg.pure(); return x == y; }
    boolean b12() { int x = f; int y = f; privPure(); return x == y; }
    boolean b14() { int x = f; int y = f; returnsNew(); return x == y; }
    boolean b15() { int x = f; int y = f; callsPrivate(); return x == y; }
    boolean b16() { int x = f; int y = f; int z = listSize(); return x == y; }
    boolean b18() { int x = f; int y = f; writesO(); return x == y; }
    boolean b19() { int x = f; int y = f; sreads(); return x == y; }
    boolean b21() { int x = f; int y = f; writesArg(o); return x == y; }
    boolean b22() { int x = f; int y = f; o.writesArg(o); return x == y; }
    boolean b23() { int x = gg.h; int y = gg.h; pure(); return x == y; }
    boolean b24() { int x = f; int y = f; pureArg(this); return x == y; }
    boolean b25(F p) { int x = p.f; int y = p.f; p.pure(); return x == y; }
    boolean b26(F p) { int x = p.f; int y = p.f; pure(); return x == y; }
}
class G {
    int h;
    void pure() { }
}
