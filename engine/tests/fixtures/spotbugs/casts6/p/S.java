package p;
import java.util.*;
public class S {
    public static class C {} public static class D extends C {} public interface I {} public interface J {}
    public abstract static class A {} public static class AD extends A {} public static class E extends C implements I {}
    public static final class F {}
    C fc; Collection<String> fcol; static Object so;
    public void s1(Object o) { if (o instanceof A) { AD d = (AD) o; foo(d); } }
    void s2(Object o) { if (o instanceof C) { D d = (D) o; foo(d); } }
    public void s3(Object o) { if (o instanceof I) { J j = (J) o; foo(j); } }
    public void s4(boolean b) { C c = b ? new C() : new D(); D d = (D) c; foo(d); }
    public void s5(boolean b) { C c; if (b) c = new C(); else c = new E(); D d = (D) c; foo(d); }
    public void s6(C a, C b, boolean z) { C c = z ? a : b; D d = (D) c; foo(d); }
    public void s7(C a) { C c = a; c = a; D d = (D) c; foo(d); }
    public void s8() { C c = fc; D d = (D) c; foo(d); }
    public void s9() { C c = this.fc; D d = (D) c; foo(d); }
    public S() { D d = (D) fc; foo(d); }
    public S(C c) { D d = (D) c; foo(d); }
    S(C c, int x) { D d = (D) c; foo(d); }
    public void s10() { Runnable r = new Runnable() { public void run() { D d = (D) fc; foo(d); } }; r.run(); }
    public void s11(C c) { Object r = new Object() { public String toString() { D d = (D) c; return "" + d; } }; foo(r); }
    public <T extends C> void s12(T t) { D d = (D) t; foo(d); }
    public void s13(Object[] a) { if ((Object) a instanceof Set) foo(a); }
    public void s14(Object[] a) { Set<?> s = (Set<?>) (Object) a; foo(s); }
    public void s15(Object o) { if (o instanceof D d) foo(d); }
    public void s16(C c) { if (c instanceof D d) foo(d); }
    public void s17(Collection<String> c) { if (c instanceof List<String> l) foo(l); }
    public void s18() { List<String> l = (List<String>) fcol; foo(l); }
    void s19() { Collection<String> c = fcol; List<String> l = (List<String>) c; foo(l); }
    public void s20(Collection<String> c) { Collection<String> x = c; List<String> l = (List<String>) x; foo(l); }
    void s21(Collection<String> c) { ArrayList<String> l = (ArrayList<String>) c; foo(l); }
    public void s22(Collection<String> c) { HashSet<String> l = (HashSet<String>) c; foo(l); }
    public void s23(Collection<String> c) { LinkedList<String> l = (LinkedList<String>) c; foo(l); }
    public void s24(Set<String> c) { HashSet<String> l = (HashSet<String>) c; foo(l); }
    public void s25(Map<String,String> c) { TreeMap<String,String> l = (TreeMap<String,String>) c; foo(l); }
    public void s26(Iterable<String> c) { ArrayList<String> l = (ArrayList<String>) c; foo(l); }
    public void s27(List<String> c) { LinkedList<String> l = (LinkedList<String>) c; foo(l); }
    public void s28(Collection c) { List l = (List) c; foo(l); }
    public void s29(Collection<? extends C> c) { List<? extends C> l = (List<? extends C>) c; foo(l); }
    public void s30(D d) { if (d instanceof C) foo(d); }
    void s31(D d) { if (d instanceof C) foo(d); }
    public void s32() { if (fc instanceof C) foo(1); }
    public void s33() { if (mk() instanceof C) foo(1); }
    public void s34() { if (so instanceof Object[]) foo(1); }
    public void s35(Exception e) { try { foo(1); } catch (IllegalStateException x) { if (x instanceof RuntimeException) foo(x); } }
    public void s36() { try { foo(1); } catch (RuntimeException x) { Throwable t = x; if (t instanceof java.io.IOException) foo(x); } }
    void s37() { try { foo(1); } catch (RuntimeException x) { Throwable t = x; if (t instanceof java.io.IOException) foo(x); } }
    public void s38(C c) { Object o = c; if (o instanceof F) foo(1); }
    public void s39(C c) { if (c instanceof I) foo(1); }
    public void s40(F f) { Object o = f; if (o instanceof C) foo(1); }
    public void s41() { Object o = new C(); D d = (D) o; foo(d); }
    void s42() { Object o = new C(); if (o instanceof D) foo(o); }
    public void s43() { Object o = fc; if (o instanceof F) foo(o); }
    public void s44(F f) { Object o = f; F g = (F) o; foo(g); }
    public void s45(String s) { Object o = s; if (o instanceof Integer) foo(o); }
    public void s46(String s) { Object o = s; if (o instanceof CharSequence) foo(o); }
    public void s47(java.lang.reflect.Type t) { if (t instanceof java.lang.reflect.Type) foo(t); }
    public void s48(List<String> l) { Object o = l; if (o instanceof Collection) foo(o); }
    C mk() { return new C(); }
    static void foo(Object o) {}
}
