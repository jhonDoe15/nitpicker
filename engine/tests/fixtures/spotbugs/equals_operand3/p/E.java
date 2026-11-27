package p;
import java.util.*;
public class E {
    record P(Object a) {}
    sealed interface S permits S1, S2 {}
    record S1(int x) implements S {}
    record S2(int y) implements S {}
    static class B1 { public boolean equals(Object o) { return switch (o) { case String s when s.isEmpty() -> true; case Integer i -> false; default -> false; }; } }
    static class B4 { public boolean equals(Object o) { return o instanceof P(var s); } }
    static class B5 { public boolean equals(Object o) { Object x = o; return switch (x) { case Short s -> true; default -> false; }; } }
    static class B6 { public boolean equals(Object o) { return o.getClass() == String.class; } }
    static class B7 { public boolean equals(Object o) { return o != null && o.getClass().isInstance(o) && String.class.isInstance(o); } }
    static class B8 { public boolean equals(Object o) { Class<?> c = String.class; return c.isInstance(o); } }
    static class B9 { public boolean equals(Object o) { Class<?> c = String.class; c = Integer.class; return c.isInstance(o); } }
    static class B10 { public boolean equals(Object o) { return Integer.class.cast(o) == null; } }
    static class B11 { public boolean equals(Object o) { return String.class.isInstance(o) || String.class.isInstance(o) || Integer.class.isInstance(o) || o instanceof String; } }
    static class B12 { public boolean equals(Object o) {
        return o != null
            && o instanceof
               String
            && ((Object) o)
               instanceof Integer; } }
    static class B13 { public boolean equals(Object o) {
        if (o instanceof Integer) return true;
        if (o instanceof Integer) return false;
        if (o instanceof String) { String s = (String) o; return true; }
        return (Integer) o == 1;
    } }
    static class B14 { public boolean equals(Object o) { return java.lang.String.class.isInstance(o); } }
    static class B15 { public boolean equals(Object o) { return o.equals(this) || ((String) o).isEmpty(); } }
    static class B16 { public boolean equals(Object o) { return List.class.isAssignableFrom(o.getClass()); } }
    static class B17 { public boolean equals(Object o) { Object x = o; x = null; return false; } }
    static class B18 { public boolean equals(Object o) { Object x = o; { x = new Object[] {o}[0]; } return x instanceof String; } }
    static class B19 { public boolean equals(Object o) { for (Object x : new Object[]{o}) { if (x instanceof Integer) return true; } return false; } }
    static class B20 { public boolean equals(Object o) { if (!(o instanceof Integer)) return false; Integer i = (Integer) o; return i == 1; } }
    static class B21 { public boolean equals(Object o) { Object p = o; Object q = o; return p instanceof Integer || q instanceof String; } }
    static class B23 { public boolean equals(Object o) { return (o) instanceof Integer; } }
    static class B24 { public boolean equals(Object o) { return ((Integer) (o)) == 1; } }
    static class B25 { public boolean equals(Object o) { Object x = o; return x instanceof Integer i ? true : x instanceof String; } }
    static class B26 { public boolean equals(Object o) { Object x = o != null ? o : o; return x instanceof Integer; } }
    static class B27 { public boolean equals(Object o) { Object x = o; Object y; y = x; return y instanceof Integer; } }
    static class B28 { public boolean equals(Object o) { Object x = (Object) o; Object y = (Object) x; return y instanceof Integer; } }
    static class B29 { public boolean equals(Object o) { Object x = o; return ((Object) x) instanceof Integer; } }
    static class B30 { public boolean equals(Object o) { Object[] a = new Object[]{o}; Object x = a[0]; return x instanceof Integer; } }
}
