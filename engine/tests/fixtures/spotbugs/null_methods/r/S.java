package r;
public class S {
    static boolean s1(Object o) { synchronized (o) { return true; } }
    static int n;
    static boolean s2(Object o) { synchronized (o) { n++; } return true; }
    void a() { s1(null); }
    void b() { s2(null); }
    static class A { public boolean equals(Object o) { synchronized (o) { n++; } return true; } public int hashCode() { return 1; } }
    static class B { public boolean equals(Object o) { synchronized (o) { return true; } } public int hashCode() { return 1; } }
    static class C { public boolean equals(Object o) { java.util.Objects.requireNonNull(o); return true; } public int hashCode() { return 1; } }
    static class D { public boolean equals(Object o) { return s1(o); } public int hashCode() { return 1; } }
    static class F { public boolean equals(Object o) { throw new IllegalStateException(); } public int hashCode() { return 1; } }
}
