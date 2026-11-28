package p;
import java.util.*;
public class V {
    public static class C {}
    C f;
    public String[] v1(Collection<String> c) { return (String[]) c.toArray(); }
    String[] v2(List<String> c) { return (String[]) c.toArray(); }
    public String[] v3(ArrayList<String> c) { Object[] a = c.toArray(); return (String[]) a; }
    public Integer[] v4(Collection<Integer> c) { return (Integer[]) c.toArray(new Object[0]); }
    public void v5() { Object o = null; if (o instanceof String) foo(o); }
    void v6() { C c = null; if (c instanceof C) foo(c); }
    public void v7(boolean b) { Object o = null; if (b) o = "x"; if (o instanceof String) foo(o); }
    public void v8() { if (null instanceof String) foo(1); }
    public void v9() { Object o = null; foo(o); if (o instanceof Integer) foo(o); }
    public void v10() { String[] s = (String[]) new Object[0]; foo(s); }
    public void v11(Object[] a) { String[] s = (String[]) a; foo(s); }
    public void v12(int[] a) { Object o = a; long[] l = (long[]) o; foo(l); }
    public void v13(Object o) { if (o == null) { if (o instanceof String) foo(o); } }
    static void foo(Object o) {}
}
