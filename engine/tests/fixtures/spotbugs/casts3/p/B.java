package p;
public class B {
    public static class C {} public static class D extends C {} public interface I {} public static class E extends C implements I {}
    public static final class F extends C {} public abstract static class G extends C {}
    private C field; public C pub; static C sfield;
    public void u1(C c) { D d = (D) c; foo(d); }
    protected void u2(C c) { D d = (D) c; foo(d); }
    void u3(C c) { D d = (D) c; foo(d); }
    private void u4(C c) { D d = (D) c; foo(d); }
    public static void u5(C c) { D d = (D) c; foo(d); }
    public void u6(C c) { F d = (F) c; foo(d); }
    public void u7(C c) { G d = (G) c; foo(d); }
    public void u8(C c) { I d = (I) c; foo(d); }
    public void u9() { D d = (D) field; foo(d); }
    public void u10() { D d = (D) sfield; foo(d); }
    public void u11(C c) { C x = c; D d = (D) x; foo(d); }
    public void u12(C c) { foo((D) c); }
    public void u13(C c) { if (c != null) { D d = (D) c; foo(d); } }
    public void u14(C c, C e) { D d = (D) c; D f = (D) e; foo(d); foo(f); }
    public void u15(C c) { D d = (D) c; D f = (D) c; foo(d); foo(f); }
    public void u16(C[] cs) { D d = (D) cs[0]; foo(d); }
    public void u17(java.util.List<C> cs) { D d = (D) cs.get(0); foo(d); }
    public void u18(Object o) { C c = (C) o; foo(c); }
    public void u19(Number n) { Integer i = (Integer) n; foo(i); }
    public void u20(CharSequence s) { String t = (String) s; foo(t); }
    public void u21(Exception e) { RuntimeException r = (RuntimeException) e; foo(r); }
    public void u22(java.util.Map<String, C> m) { D d = (D) m.get("a"); foo(d); }
    public D u23(C c) { return (D) c; }
    static void foo(Object o) {}
}
