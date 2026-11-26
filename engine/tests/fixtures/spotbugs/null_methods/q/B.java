package q;
public class B {
    Boolean a(boolean x) { return x ? Boolean.TRUE : null; }
    Boolean b(int x) {
        if (x > 0)
            return null;
        if (x < -3)
            return null;
        return true;
    }
    Boolean c(int x) {
        if (x > 0) {
            int y = x * 2;
            if (y > 7) return true;
        }
        return null;
    }
    Boolean d(int x) { return switch (x) { case 1 -> null; default -> true; }; }
    Boolean e(int x) {
        while (x > 3) { if (x == 9) return null; x--; }
        return false;
    }
    java.lang.Boolean f() { return null; }
    <T> T g() { return null; }
    Object h() { return null; }
    Boolean i(boolean x) { return x ? null : null; }
    synchronized Boolean j() { return null; }
    Boolean k(int x) { try { if (x > 1) return null; return true; } finally { x++; } }
}
final class F {
    int v;
    public boolean equals(Object o) {
        int w = v + 1;
        w++;
        return ((F) o).v == w;
    }
    public int hashCode() { return 1; }
}
class G {
    int v;
    public boolean equals(Object o) {
        int w = v + 1;
        return o.hashCode() == w;
    }
    public int hashCode() { return 1; }
}
class H { public boolean equals(Object o) { return o.toString().isEmpty(); } public int hashCode() { return 1; } }
class I { public boolean equals(Object o) { String s = (String) o; return s.isEmpty(); } public int hashCode() { return 1; } }
class J { public boolean equals(Object o) { return ((Object[]) o).length == 1; } public int hashCode() { return 1; } }
class K { public boolean equals(Object o) { return java.util.Objects.requireNonNull(o) == this; } public int hashCode() { return 1; } }
class L { public boolean equals(Object o) { return o.equals(this) || o.hashCode() == 2; } public int hashCode() { return 1; } }
class M { public boolean equals(Object o) { if (o.hashCode() == 2) return false; return o == this; } public int hashCode() { return 1; } }
class N { public boolean equals(Object o) { return String.valueOf(o).isEmpty(); } public int hashCode() { return 1; } }
class O { public boolean equals(Object o) { return "x".equals(o.toString()); } public int hashCode() { return 1; } }
class Q { public boolean equals(Object o) { return o.getClass() == B.class; } public int hashCode() { return 1; } }
class R { int v; public boolean equals(Object o) { R r = (R) o; if (r == null) return false; return r.v == v; } public int hashCode() { return 1; } }
abstract class S { public abstract boolean equals(Object o); }
interface T { default boolean eq(Object o) { return o.hashCode() == 1; } }
class U { public static boolean equals(Object o, Object p) { return o.hashCode() == 1; } }
class V { public boolean equals(Object o) { return new java.util.ArrayList<>((java.util.Collection<?>) o).isEmpty(); } public int hashCode() { return 1; } }
class W { public boolean equals(Object o) { return ((Integer) o) == 4; } public int hashCode() { return 1; } }
enum X { A; boolean same(Object o) { return o.hashCode() == 1; } }
class Y { Runnable r = new Runnable() { public void run() {} public boolean equals(Object o) { return o.hashCode() == 1; } public int hashCode() { return 1; } }; }
