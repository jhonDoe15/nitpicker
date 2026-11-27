package p;
public class B {
    int f; long g; Object h; String t;
    static class S extends B { int sf; }
    interface I { }
    static class K extends B implements I { }
    void c1(S o) { int z = ((B) o).f; }
    void c2(S o) { int z = ((B) o).f; z = 3; }
    void c3(S o) { long z = ((B) ((B) o)).g; }
    void c4(K o) { int z = ((B) o).f; }
    void c5(K o) { int z = ((I) o).hashCode(); }
    void c6() { int z = ((B) this).f; }
    void c7() { int z = ((Object) this).hashCode(); }
    void c8() { Object z = ((B) this).h; }
    void c9(S o) { int z = (((B) (o))).f; }
    void c10(S o) { int z = ((S) o).f; }
    void c11(Object o) { int z = ((B) o).f; }
    <T extends B> void c12(T o) { int z = ((B) o).f; }
    <T extends S> void c13(T o) { int z = ((B) o).f; }
    <T> void c14(T o) { int z = ((B) o).f; }
    void c15(S o) { String z = ((B) o).t; }
    void c16(S o) { int z = ((S) (B) o).sf; }
    void c17(S[] o) { int z = ((B) o[0]).f; }
    void c18(S o) { long z = ((B) o).g; }
    void c19(S o) { Object z = ((B) o).h; }
    void c20(S o) { int z = ((B) o).f; }
    void c21(S o, int q) { int z = ((B) o).f; if (q > 0) z = 2; }
    void c22(S o) { int z = (int) ((B) o).f; }
    void c23(S o) { long z = (long) ((B) o).f; }
    void c24(S o) { Object z = (Object) o; }
    void c25(S o) { int z = ((B) o).f + 1; }
    void c26(S o) { int z = ((B) o).t.length(); }
    void c27(java.util.List<S> o) { int z = ((B) o.get(0)).f; }
    void c28(S o) { B b = o; int z = ((B) b).f; }
}
