package p;

public class F {
    String str; int f; int g; static int s; F o; java.util.List<String> list;
    void pure() { }
    int reads() { return f + g; }
    void writesG() { g = 1; }
    void writesF() { f = 1; }
    void prints() { System.out.println("x"); }
    static void spure() { }
    static void swrites() { s = 2; }
    void callsPure() { pure(); }
    void callsWrites() { writesG(); }
    void loops() { while (true) { } }
    void throwsIt() { throw new IllegalStateException(); }
    void newer() { Object x = new Object(); }
    void listAdd() { list.add("a"); }
    int len(String v) { return v.length(); }
    boolean a1() { String x = str; pure(); return x.equals(x); }
    boolean a2() { int x = f; int y = f; reads(); return x == y; }
    boolean a3() { int x = f; int y = f; writesG(); return x == y; }
    boolean a4() { int x = f; int y = f; writesF(); return x == y; }
    boolean a5() { int x = f; int y = f; prints(); return x == y; }
    boolean a6() { int x = f; int y = f; spure(); return x == y; }
    boolean a7() { int x = f; int y = f; swrites(); return x == y; }
    boolean a8() { int x = f; int y = f; callsPure(); return x == y; }
    boolean a9() { int x = f; int y = f; callsWrites(); return x == y; }
    boolean a10() { int x = f; int y = f; throwsIt(); return x == y; }
    boolean a11() { int x = f; int y = f; newer(); return x == y; }
    boolean a12() { int x = f; int y = f; listAdd(); return x == y; }
    boolean a13() { int x = f; int y = f; str.length(); return x == y; }
    boolean a14() { int x = f; int y = f; len("a"); return x == y; }
    boolean a15() { int x = f; int y = f; Math.abs(3); return x == y; }
    boolean a16() { int x = f; int y = f; String.valueOf(3); return x == y; }
    boolean a17() { int x = f; int y = f; new Object(); return x == y; }
    boolean a18() { int x = f; int y = f; o.pure(); return x == y; }
    boolean a19() { int x = f; int y = f; list.size(); return x == y; }
    boolean a20() { int x = f; int y = f; Integer.valueOf(3); return x == y; }
    boolean a21() { int x = s; int y = s; pure(); return x == y; }
    boolean a22() { int x = s; int y = s; swrites(); return x == y; }
    boolean a23() { int x = f; int y = f; new F(); return x == y; }
    boolean a24() { int x = f; int y = f; loops(); return x == y; }
    boolean a25() { int x = f; int y = f; Object q = new StringBuilder(); return x == y; }
    boolean a26(Runnable r) { int x = f; int y = f; r.run(); return x == y; }
    boolean a27() { int x = f; int y = f; toString(); return x == y; }
    boolean a28() { int x = f; int y = f; hashCode(); return x == y; }
}
