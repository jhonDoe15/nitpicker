package p;

import java.util.ArrayList;

public class N {
    public void n1() { foo((String) (Object) new Object()); }
    public void n2() { foo((Integer) (Object) new ArrayList<String>()); }
    public void n3() { Object o = new StringBuilder("x"); foo((String) o); }
    public void n4() { try { foo(1); } catch (IllegalStateException e) { RuntimeException r = e; Exception x = r; if (x instanceof java.io.IOException) foo(x); } }
    void n5() { try { foo(1); } catch (RuntimeException e) { Throwable t = e; foo((Error) t); } }
    public void n6() { try { foo(1); } catch (RuntimeException e) { Throwable t = e; while (t instanceof java.io.IOException && t.getCause() != null) { t = t.getCause(); } foo(t); } }
    static void foo(Object o) {}
}
