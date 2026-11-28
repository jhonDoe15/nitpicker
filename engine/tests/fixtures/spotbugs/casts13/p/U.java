package p;
import java.util.*;
public class U {
    public static class C {} public static class D extends C {} public static class E extends D {}
    public void a1(Collection<String> c) { if (c instanceof SortedSet) foo(1); Set<String> s = (Set<String>) c; foo(s); }
    public void a2(Collection<String> c) { if (c instanceof Set) foo(1); SortedSet<String> s = (SortedSet<String>) c; foo(s); }
    public void a3(Collection<String> c) { if (c instanceof ArrayList) foo(1); List<String> s = (List<String>) c; foo(s); }
    public void a4(C c) { if (c instanceof E) foo(1); D d = (D) c; foo(d); }
    public void a5(Collection<String> c) { if (c instanceof SortedSet) { foo(1); } else { Set<String> s = (Set<String>) c; foo(s); } }
    public void a6(Collection<String> c) { if (c instanceof NavigableSet) foo(1); else if (c instanceof SortedSet) foo(2); else { Set<String> s = (Set<String>) c; foo(s); } }
    public void a7(C c) { if (c instanceof E) foo(1); else { D d = (D) c; foo(d); } }
    static void foo(Object o) {}
}
