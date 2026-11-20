package p;
import java.io.*;
import java.util.*;
public class C {
    static void boom() { throw new IllegalStateException("x"); }
    static void boom2() { boom(); }
    static void boom3() { boom2(); }
    static void maybe(Object o) { if (o == null) { throw new IllegalArgumentException(); } }
    static void declared() throws IOException { }
    static void declaredThrows() throws IOException { throw new IOException(); }
    static void swallow() { try { boom(); } catch (RuntimeException e) { } }
    interface Api { void run(); }
    static class Impl implements Api { public void run() { throw new IllegalStateException(); } }
    public static class C1 { public C1() { throw new IllegalArgumentException(); } }
    public static class C2 { public C2(Object x) { if (x == null) { throw new IllegalArgumentException(); } } }
    public static class C3 { public C3() { check(); } private void check() { throw new IllegalStateException(); } }
    public static class C4 { public C4() { boom(); } }
    public static class C5 { public C5() { boom2(); } }
    public static class C5b { public C5b() { boom3(); } }
    public static class C6 { Reader r; public C6(String p) throws IOException { r = new FileReader(p); } }
    public static class C7 { int v; public C7(String s) { v = Integer.parseInt(s); } }
    public static class C8 { Object o; public C8(Object o) { this.o = Objects.requireNonNull(o); } }
    public static final class C9 { public C9() { throw new IllegalArgumentException(); } }
    public static class C10 { public C10() { throw new IllegalArgumentException(); } protected final void finalize() { } }
    public static class C11 { public C11() { try { throw new IllegalArgumentException(); } catch (Exception e) { } } }
    public static class C12 { public C12() { try { boom(); } catch (IllegalStateException e) { throw new RuntimeException(e); } } }
    public static class C13 { private C13() { throw new IllegalArgumentException(); } static C13 make() { return new C13(); } }
    public enum C14 { A; C14() { if (ordinal() > 5) { throw new IllegalArgumentException(); } } }
    public record C14r(String a) { public C14r { if (a == null) { throw new IllegalArgumentException(); } } }
    public static class C16 { public C16() { this(null); } public C16(Object o) { maybe(o); } }
    public static class C17 extends C2 { public C17(Object o) { super(o); } }
    public static class C18 { int v = init(); public C18() { } static int init() { throw new IllegalStateException(); } }
    public abstract static class C19 { protected C19() { throw new IllegalArgumentException(); } }
    public class C20 { public C20() { throw new IllegalArgumentException(); } }
    public static class C21 { public C21() throws Exception { throw new Exception(); } }
    public static class C22 { public C22(Api a) { a.run(); } }
    public static class C22b { public C22b(Impl a) { a.run(); } }
    public static class C23 { public C23() { hook(); } public void hook() { throw new UnsupportedOperationException(); } }
    public static class C24 { Runnable r; public C24() { r = () -> { throw new IllegalStateException(); }; } }
    public static class C25 { public C25(int x) { assert x > 0; } }
    public static class C26 { public C26(int x, Object o) {
        if (x < 0) { throw new IllegalArgumentException(); }
        maybe(o);
        if (x > 9) { throw new IllegalStateException(); }
    } }
    public static class C27 extends RuntimeException { public C27(String m) { super(m); if (m == null) { throw new IllegalArgumentException(); } } }
    public static class C28 { public C28() { swallow(); } }
    static class C29 { C29() { throw new IllegalArgumentException(); } }
    private static class C29b { public C29b() { throw new IllegalArgumentException(); } }
    public static class C30 { public C30() throws IOException { declared(); } }
    public static class C30b { public C30b() throws IOException { declaredThrows(); } }
    public static class C32 { public C32(int k) { switch (k) { case 1: break; default: throw new IllegalArgumentException(); } } }
    public static class C35 { String s; public C35(List<String> l) { s = String.format("%s", l.get(0)); } }
    public static class C36 { Class<?> c; public C36(String n) throws ClassNotFoundException { c = Class.forName(n); } }
    public static class C37 { public C37(Object o) { try { maybe(o); } finally { System.out.println(); } } }
    public static class C38 { public C38() { throw new AssertionError(); } }
    public static class C39 { public C39(String s) { if (s.isEmpty()) { throw new IllegalArgumentException(); } } @Override protected void finalize() { } }
    public static class C40 { public C40() { new C1(); } }
    public static class C41 { C1 c; public C41() { c = new C1(); } }
    public static class C42 { public C42(Object o) { Objects.requireNonNull(o, "o"); } }
    public static class C43 { public C43(Object o) { if (o == null) { throw new NullPointerException(); } } }
    public static class C44 { public C44() { throw fail(); } static RuntimeException fail() { return new IllegalStateException(); } }
    public static class C45 { public C45() { throw new UnsupportedOperationException(); } }
}
