package p;
import java.util.*;
public class B {
    interface I {} interface J {} static class C implements I {} static class D extends C {} static final class F {}
    static class G {}
    Object of() { return new Object(); }
    Collection<String> coll() { return new ArrayList<>(); }
    void b1(Object o) { String s = (String) o; foo(s); }
    void b2(Collection<String> c) { List<String> l = (List<String>) c; foo(l); }
    void b3(Collection<String> c) { Set<String> s = (Set<String>) c; foo(s); }
    void b4(Collection<String> c) { ArrayList<String> l = (ArrayList<String>) c; foo(l); }
    void b5(Iterable<String> c) { Collection<String> l = (Collection<String>) c; foo(l); }
    void b6(Map<String, String> m) { HashMap<String, String> h = (HashMap<String, String>) m; foo(h); }
    void b7(I i) { C c = (C) i; foo(c); }
    void b8(C c) { D d = (D) c; foo(d); }
    void b9(C c) { if (c instanceof D) foo(c); }
    void b10(D d) { if (d instanceof C) foo(d); }
    void b11(D d) { if (d instanceof I) foo(d); }
    void b12(C c) { if (c instanceof J) foo(c); }
    void b13(G g) { Object o = g; if (o instanceof C) foo(o); }
    void b14(G g) { Object o = g; C c = (C) o; foo(c); }
    void b15() { Object o = of(); String s = (String) o; foo(s); }
    void b16() { Collection<String> c = coll(); List<String> l = (List<String>) c; foo(l); }
    void b17(Object o) { if (o instanceof String) { String s = (String) o; foo(s); } }
    void b18(Object o) { String s = (String) o; Integer i = (Integer) o; foo(s); foo(i); }
    void b19(List<String> l) { if (l instanceof Collection) foo(l); }
    void b20(Object o) { Object x = new ArrayList<String>(); if (x instanceof List) foo(x); }
    void b21() { Object x = new ArrayList<String>(); if (x instanceof Set) foo(x); }
    void b22() { Object x = new ArrayList<String>(); Set<?> s = (Set<?>) x; foo(s); }
    void b23(Object o) { C c = (C) o; D d = (D) c; foo(d); }
    void b24(F f) { Object o = f; if (o instanceof I) foo(o); }
    void b25(Object[] a) { String[] s = (String[]) a; foo(s); }
    void b26(I i) { if (i instanceof J) foo(i); }
    void foo(Object o) {}
}
