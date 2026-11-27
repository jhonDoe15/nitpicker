package p;
import java.util.*;
public class R {
    public static class C {} public static class D extends C {} public interface I {}
    public static abstract class A {} public static class AD extends A {}
    C mk() { return null; } public C pmk() { return null; } static C smk() { return null; } A amk() { return null; }
    private C priv() { return null; } I imk() { return null; }
    public void r1() { D d = (D) mk(); foo(d); }
    void r2() { D d = (D) mk(); foo(d); }
    public void r3() { D d = (D) pmk(); foo(d); }
    public void r4() { D d = (D) smk(); foo(d); }
    public void r5() { AD d = (AD) amk(); foo(d); }
    public void r6() { D d = (D) priv(); foo(d); }
    public void r7() { C c = mk(); D d = (D) c; foo(d); }
    public void r8(R r) { D d = (D) r.mk(); foo(d); }
    public void r9() { Collection<String> c = new ArrayList<>(); List<String> l = (List<String>) Collections.unmodifiableCollection(c); foo(l); }
    public void r10(Map<String, String> m) { List<String> l = (List<String>) m.values(); foo(l); }
    public void r11() { D d = (D) this.mk(); foo(d); }
    public void r12(C c) { if (c instanceof D) { D d = (D) c; foo(d); } }
    public void r13(C c, boolean b) { if (b && c instanceof D) { D d = (D) c; foo(d); } }
    public void r14(C c, boolean b) { if (b || c instanceof D) { D d = (D) c; foo(d); } }
    public void r15(C c) { if (!(c instanceof D)) return; D d = (D) c; foo(d); }
    public void r16(C c) { if (c instanceof D) foo(1); D d = (D) c; foo(d); }
    public void r17(C c) { boolean x = c instanceof D; D d = (D) c; foo(d); foo(x); }
    public void r18(C c) { if (c instanceof I) { D d = (D) c; foo(d); } }
    public void r19(C c) { if (c.getClass() == D.class) { D d = (D) c; foo(d); } }
    public void r20(C c) { foo(c); D d = (D) c; foo(d); }
    public void r21(C c) { c = mk(); D d = (D) c; foo(d); }
    public void r22(C c) { Runnable q = () -> { D d = (D) c; foo(d); }; q.run(); }
    public void r23(C c) { try { D d = (D) c; foo(d); } catch (ClassCastException e) { foo(e); } }
    public void r24(Exception e) { try { foo(1); } catch (RuntimeException x) { IllegalStateException s = (IllegalStateException) x; foo(s); } }
    public void r25(C c) { switch (c) { case D d -> foo(d); default -> foo(c); } }
    public void r26(Object o) { if (o instanceof C) { D d = (D) o; foo(d); } }
    static void foo(Object o) {}
}
