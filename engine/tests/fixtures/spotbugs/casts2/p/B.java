package p;
import java.util.*;
public class B {
    static class C {} static class D extends C {} interface I {} static class E extends C implements I {}
    private C field; C pub;
    C mk() { return new D(); }
    static Collection<String> coll() { return new ArrayList<>(); }
    void c1(Collection<String> c) { List<String> l = (List<String>) c; foo(l); }
    void c2(Collection<String> c) { Queue<String> l = (Queue<String>) c; foo(l); }
    void c3(Collection<String> c) { SortedSet<String> l = (SortedSet<String>) c; foo(l); }
    void c4(Collection<String> c) { Deque<String> l = (Deque<String>) c; foo(l); }
    void c5(Iterable<String> c) { List<String> l = (List<String>) c; foo(l); }
    void c6(List<String> c) { RandomAccess r = (RandomAccess) c; foo(r); }
    void c7(Map<String, String> c) { SortedMap<String, String> r = (SortedMap<String, String>) c; foo(r); }
    void c8(Object o) { List<String> l = (List<String>) o; foo(l); }
    void c9(Collection<String> c) { AbstractList<String> l = (AbstractList<String>) c; foo(l); }
    void c10(Set<String> c) { SortedSet<String> l = (SortedSet<String>) c; foo(l); }
    void c11(List<String> c) { ArrayList<String> l = (ArrayList<String>) c; foo(l); }
    void c12() { List<String> l = (List<String>) coll(); foo(l); }
    void c13(Collection<String> c) { if (c instanceof List) { List<String> l = (List<String>) c; foo(l); } }
    void c14(C c) { D d = (D) c; foo(d); }
    void c15() { D d = (D) field; foo(d); }
    void c16() { D d = (D) pub; foo(d); }
    void c17() { D d = (D) mk(); foo(d); }
    void c18(C c) { I i = (I) c; foo(i); }
    void c19(C c) { E e = (E) c; foo(e); }
    void c20(C c, boolean b) { D d = (D) c; foo(d); if (b) foo(c); }
    void c21(Collection<String> c) { List<String> l = (List<String>) c; foo(l); List<String> k = (List<String>) c; foo(k); }
    public void c22(C c) { D d = (D) c; foo(d); }
    private void c23(C c) { D d = (D) c; foo(d); }
    void c24(Collection<String> c) { foo((List<String>) c); }
    void c25(Collection<String> c) { ((List<String>) c).get(0); }
    void foo(Object o) {}
}
