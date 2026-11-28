package p;
import java.util.*;
public class W<E extends Number> {
    public static class C {} public static class D extends C {} public static class E2 extends C {}
    final C fin() { return null; } public C pub() { return null; }
    static C sfc;
    static { D d = (D) sfc; foo(d); }
    public void w1() { D d = (D) fin(); foo(d); }
    public void w2(W<?> o) { D d = (D) o.pub(); foo(d); }
    public void w3(C c) { try { D d = (D) c; foo(d); } catch (RuntimeException e) { foo(e); } }
    public void w4(C c) { try { D d = (D) c; foo(d); } catch (Exception e) { foo(e); } }
    public void w5(C c) { try { D d = (D) c; foo(d); } catch (IllegalStateException e) { foo(e); } }
    public void w6(C c) { try { D d = (D) c; foo(d); } finally { foo(1); } }
    public void w7(Collection<String> c) { NavigableSet<String> s = (NavigableSet<String>) c; foo(s); }
    public void w8(Collection<String> c) { Queue<String> s = (Queue<String>) c; foo(s); }
    public void w9(Queue<String> c) { ArrayDeque<String> s = (ArrayDeque<String>) c; foo(s); }
    public void w10(SortedMap<String, String> c) { TreeMap<String, String> s = (TreeMap<String, String>) c; foo(s); }
    public void w11(Collection<String> c) { TreeSet<String> s = (TreeSet<String>) c; foo(s); }
    public void w12(Collection<String> c) { Vector<String> s = (Vector<String>) c; foo(s); }
    public void w13(Collection<String> c) { LinkedHashSet<String> s = (LinkedHashSet<String>) c; foo(s); }
    public void w14(Map<String, String> c) { LinkedHashMap<String, String> s = (LinkedHashMap<String, String>) c; foo(s); }
    public void w15(Collection<String> c) { ArrayDeque<String> s = (ArrayDeque<String>) c; foo(s); }
    public void w16(Map<String, String> c) { SortedMap<String, String> s = (SortedMap<String, String>) c; foo(s); }
    public void w17(Map<String, String> c) { ConcurrentModificationException s = null; Hashtable<String, String> h = (Hashtable<String, String>) c; foo(h); foo(s); }
    public void w18(List<? extends C> l) { if (l instanceof Collection) foo(1); }
    public void w19(List<E> l) { if (l instanceof Collection) foo(1); }
    public void w20(Map<String, List<Integer>> m) { if (m instanceof Map) foo(1); }
    public void w21(List<int[]> l) { if (l instanceof Collection) foo(1); }
    public void w22(Collection<String> c) { AbstractList<String> s = (AbstractList<String>) c; foo(s); }
    public void w23(List<String> c) { AbstractList<String> s = (AbstractList<String>) c; foo(s); }
    public void w24(Collection<String> c) { ArrayList<String> s = (ArrayList<String>) c; foo(s); ArrayList<String> t = (ArrayList<String>) c; foo(t); }
    public void w25(Collection<String> c) { List<String> s = (List<String>) c; foo(s);
        List<String> t = (List<String>) c; foo(t); }
    public void w26(Set<String> c) { if (c instanceof Collection<?>) foo(1); }
    public void w27(E e) { if (e instanceof Number) foo(1); }
    public void w28(C c) { D d = (D) c; foo(d); D e = (D) c; foo(e); }
    static void foo(Object o) {}
}
