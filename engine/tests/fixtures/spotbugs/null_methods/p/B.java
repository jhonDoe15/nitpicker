package p;
import java.util.function.*;
public class B {
    Boolean a() { return null; }
    Boolean b(int x) { if (x > 0) return true; return null; }
    Boolean c(int x) { if (x > 0) return null; if (x < -5) return Boolean.FALSE; return null; }
    Boolean d(boolean x) { return x ? null : Boolean.TRUE; }
    Boolean e(Boolean x) { Boolean r = null; if (x != null) r = x; return r; }
    Boolean f() { Boolean r = null; return r; }
    static Boolean g() { return null; }
    Supplier<Boolean> h() { return () -> null; }
    Supplier<Boolean> i() { return () -> { return null; }; }
    Object j = new Object() { Boolean k() { return null; } };
    Boolean l(int x) {
        switch (x) { case 1: return true; default: return null; }
    }
    Boolean m(int x) { return switch (x) { case 1 -> true; default -> null; }; }
    java.util.Optional<String> n() { return null; }
    boolean o(Boolean x) { return x; }
    Boolean q(Object o) { return (Boolean) null; }
    Boolean r() { Object v = null; return (Boolean) v; }
    abstract static class Z { abstract Boolean z(); }
    Function<String, Boolean> s() { return k -> null; }
    Boolean t(int x) {
        if (x > 0)
            return
                null;
        return false;
    }
    Boolean u(int x) { try { return x > 1; } catch (RuntimeException ex) { return null; } }
}
