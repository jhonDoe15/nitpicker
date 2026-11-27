package p;
import java.util.*;
public class Y {
    public static class C {} public static class D extends C {} public static class E extends C {} public interface I {}
    private Object fo; private C fc; public Collection<String> pcol; Collection<String> kcol;
    private final Object keys;
    public Y(boolean b) { fo = new ArrayList<String>(); fc = new D(); keys = new Object[1]; }
    public void y1(C c) { D d = (D) c; foo(d); if (c instanceof D) foo(1); }
    public void y2(C c, C e) { if (e instanceof D) foo(1); D d = (D) c; foo(d); }
    public void y3(C c, boolean b) { if (b) { if (c instanceof D) foo(1); } else { D d = (D) c; foo(d); } }
    private C mk() { return new C(); }
    private static C smk() { return new D(); }
    private C pass(C c) { return c; }
    C open() { return new C(); }
    public void y4() { D d = (D) mk(); foo(d); }
    public void y5() { E e = (E) smk(); foo(e); }
    public void y6(C c) { D d = (D) pass(c); foo(d); }
    public void y7() { D d = (D) open(); foo(d); }
    public void y8() { if (fo instanceof Set) foo(1); }
    public void y9() { E e = (E) fc; foo(e); }
    public void y10() { if (keys instanceof Set) foo(1); }
    public void y11(Object[] a) { if (a[0] instanceof Set) foo(1); }
    public void y12(boolean b) { Object o = b ? new ArrayList<String>() : new LinkedList<String>(); Set<?> s = (Set<?>) o; foo(s); }
    public void y13(boolean b) { Object o = b ? new ArrayList<String>() : new LinkedList<String>(); if (o instanceof Set) foo(1); }
    public void y14(Object o) { if (o instanceof Object) foo(1); }
    public void y15() { try { foo(1); } catch (IllegalStateException x) { if (x instanceof RuntimeException) foo(x); } }
    public void y16() { try { thr(); } catch (java.io.IOException x) { if (x instanceof Exception) foo(x); } }
    public void y17() { try { thr(); } catch (java.io.IOException | IllegalStateException x) { if (x instanceof Exception) foo(x); } }
    public void y18() { try { foo(1); } catch (IllegalStateException x) { IllegalArgumentException a = (IllegalArgumentException) (Object) x; foo(a); } }
    public void y19() { List<String> l = (List<String>) pcol; foo(l); }
    void y20() { List<String> l = (List<String>) kcol; foo(l); }
    public void y21() { List<String> l = (List<String>) coll(); foo(l); }
    public void y22() { ArrayList<String> l = (ArrayList<String>) pcol; foo(l); }
    public void y23(Collection<String> c) { if (c instanceof Set) { SortedSet<String> s = (SortedSet<String>) c; foo(s); } }
    public void y24(Collection<String> c) { if (c instanceof List) foo(1); List<String> l = (List<String>) c; foo(l); }
    public void y25(Collection<String> c) { List<String> l = (List<String>) c; foo(l); if (c instanceof List) foo(1); }
    public void y26(Collection<String> c, Collection<String> e) { if (e instanceof List) foo(1); List<String> l = (List<String>) c; foo(l); }
    public void y27(Object o) { String s = (String) o; if (o instanceof String) foo(s); }
    public void y28(C c) { D d = (D) c; foo(d); E e = (E) c; foo(e); }
    public void y29(Collection<String> c) { ((List<String>) c).size(); ((List<String>) c).size(); }
    public void y30(C c) { foo((D) c); foo((D) c); }
    Collection<String> coll() { return null; }
    static void thr() throws java.io.IOException {}
    static void foo(Object o) {}
}
class Z extends Y.C { void z1() { Y.D d = (Y.D) (Y.C) this; Y.foo(d); } public void z2() { Object o = this; Y.D d = (Y.D) o; Y.foo(d); } }
