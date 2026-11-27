package p;
public class X {
    public static class C {} public static class D extends C {} public interface I {} public interface J {}
    public static class K {} public abstract static class A {} public static class AD extends A {}
    public interface M {} public static class MC implements M {}
    C fc; I fi;
    public void x1(I i) { J j = (J) i; foo(j); }
    void x2(I i) { J j = (J) i; foo(j); }
    public void x3(I i) { K k = (K) i; foo(k); }
    void x4(I i) { K k = (K) i; foo(k); }
    public void x5(C c) { I i = (I) c; foo(i); }
    void x6(C c) { I i = (I) c; foo(i); }
    public void x7(C c) { if (c instanceof I) { D d = (D) c; foo(d); } }
    void x8(C c) { if (c instanceof I) { D d = (D) c; foo(d); } }
    public void x9(Object o) { if (o instanceof I) { J j = (J) o; foo(j); } }
    void x10(Object o) { if (o instanceof I) { J j = (J) o; foo(j); } }
    public void x11() { J j = (J) fi; foo(j); }
    public void x12() { K k = (K) fi; foo(k); }
    public void x13(A a) { AD d = (AD) a; foo(d); }
    public void x14(M m) { MC c = (MC) m; foo(c); }
    public void x15(Object o) { if (o instanceof M) { MC c = (MC) o; foo(c); } }
    public void x16(Object o) { if (o instanceof C) { I i = (I) o; foo(i); } }
    public void x17(A a) { I i = (I) a; foo(i); }
    public void x18(Number n) { Integer i = (Integer) n; foo(i); }
    public void x19(CharSequence s) { String t = (String) s; foo(t); }
    public void x20(Comparable<String> s) { String t = (String) s; foo(t); }
    public void x21(Throwable t) { Exception e = (Exception) t; foo(e); }
    public void x22(java.io.InputStream t) { java.io.FileInputStream e = (java.io.FileInputStream) t; foo(e); }
    public void x23(java.util.AbstractList<String> t) { java.util.ArrayList<String> e = (java.util.ArrayList<String>) t; foo(e); }
    public void x24(Runnable r) { Thread t = (Thread) r; foo(t); }
    public void x25(java.net.InetAddress a) { java.net.Inet6Address b = (java.net.Inet6Address) a; foo(b); }
    public void x26(Object o) { if (o instanceof I) { foo(1); } J j = (J) o; foo(j); }
    static void foo(Object o) {}
}
