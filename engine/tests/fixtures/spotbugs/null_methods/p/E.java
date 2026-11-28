package p;
public class E {
    static class A { int v; public boolean equals(Object o) { return ((A) o).v == v; } public int hashCode() { return v; } }
    static class B2 { int v; public boolean equals(Object o) { if (!(o instanceof B2)) return false; return ((B2) o).v == v; } public int hashCode() { return v; } }
    static class C { int v; public boolean equals(Object o) { if (o.getClass() != getClass()) return false; return ((C) o).v == v; } public int hashCode() { return v; } }
    static class D { int v; public boolean equals(Object o) { return o.hashCode() == v; } public int hashCode() { return v; } }
    static class F { int v; public boolean equals(Object o) { if (o == null) return false; return ((F) o).v == v; } public int hashCode() { return v; } }
    static class G { int v; public boolean equals(Object o) { return o != null && ((G) o).v == v; } public int hashCode() { return v; } }
    static class H { int v; public boolean equals(Object o) { G g = (G) o; return g.v == v; } public int hashCode() { return v; } }
    static class I { int v; public boolean equals(Object o) { return o == this || ((I) o).v == v; } public int hashCode() { return v; } }
    static class J { int v; public boolean equals(Object o) { return eq(o); } boolean eq(Object o) { return ((J) o).v == v; } public int hashCode() { return v; } }
    static class K { int v; public boolean equals(Object o) { return getClass() == o.getClass(); } public int hashCode() { return v; } }
    static class L { int v; public boolean equals(Object o) { return o.equals(this); } public int hashCode() { return v; } }
    static class M { String v; public boolean equals(Object o) { return v.equals(((M) o).v); } public int hashCode() { return 1; } }
    static class N { int v; public boolean equals(Object o) { return java.util.Objects.equals(v, ((N) o).v); } public int hashCode() { return 1; } }
    static class O { int v; public boolean equals(Object o) { if (v > 3) return false; return ((O) o).v == v; } public int hashCode() { return 1; } }
    static class Q { int v; public boolean equals(Object o) { synchronized (o) { return true; } } public int hashCode() { return 1; } }
    static class R { int v; public boolean equals(Object o) {
        return ((R) o).v
            == v; } public int hashCode() { return 1; } }
    static class S { int v; public boolean equals(Object o) { throw new UnsupportedOperationException(); } public int hashCode() { return 1; } }
    static class T { int[] v; public boolean equals(Object o) { return java.util.Arrays.equals(v, ((T) o).v); } public int hashCode() { return 1; } }
    record U(int v) { public boolean equals(Object o) { return ((U) o).v == v; } }
    static class V { int v; public final boolean equals(Object o) { return ((V) o).v == v; } public int hashCode() { return 1; } }
    static class W { int v; public boolean equals(W o) { return o.v == v; } public int hashCode() { return 1; } }
}
