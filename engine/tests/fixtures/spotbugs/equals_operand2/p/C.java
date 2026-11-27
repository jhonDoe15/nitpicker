package p;
import java.util.*;
import java.util.concurrent.*;
import java.io.Serializable;
import q.Q;

public class C {
    int v;
    // aliases
    static class A1 { public boolean equals(Object o) { Object x = o; return x instanceof String; } }
    static class A2 { public boolean equals(Object o) { Object x = o; x = new Object[] {o}[0]; return x instanceof String; } }
    static class A3 { public boolean equals(Object o) { Object x = true ? o : null; return x instanceof String; } }
    static class A4 { public boolean equals(Object o) { Object x = (Object) o; return x instanceof String; } }
    static class A5 { public boolean equals(Object o) { Object x; x = o; return x instanceof String; } }
    static class A6 { public boolean equals(Object o) { Object x = o; Object y = x; return y instanceof Integer; } }
    static class A7 { public boolean equals(Object o) { o = o; return o instanceof String; } }
    static class A8 { public boolean equals(Object o) { Object other = new Object(); return other instanceof String; } }
    static class A10 { public boolean equals(Object o) { return o != null && ((Object) o) instanceof String s && s.isEmpty(); } }
    static class A11 { public boolean equals(Object o) { return (String) o == null; } }
    static class A12 { public boolean equals(Object o) { return ((Comparable<?>) o) == null; } }
    static class A13 { public boolean equals(Object o) { var x = o; return x instanceof Integer; } }
    static class A14 { public boolean equals(final Object o) { final Object x = o; return x instanceof Long; } }
    static class A15 { public boolean equals(Object o) { Object x = o; Runnable r = () -> { Object y = x; boolean b = y instanceof Short; }; return false; } }
    static class A16 { public boolean equals(Object o) { Runnable r = () -> { boolean b = o instanceof Short; }; return false; } }
    static class A17 { public boolean equals(Object o) { return new Object() { boolean t() { return o instanceof Byte; } }.t(); } }
    static class A18 { public boolean equals(Object o) { for (Object x = o; x != null; x = null) { if (x instanceof Float) return true; } return false; } }
    static class A19 { public boolean equals(Object o) { Object x = o; if (o == null) { x = null; } return x instanceof Double; } }
    static class A20 { public boolean equals(Object o) { Object x = o, y = x; return y instanceof Character; } }
    static class A21 { public boolean equals(Object o) { Object x = o; Object x2 = (x); return x2 instanceof Character; } }
    static class A22 { public boolean equals(Object o) { Object[] arr = { o }; return arr[0] instanceof Character; } }
    static class A23 { public boolean equals(Object o) { Object x = o; { Object z = new Object(); } Object z = x; return z instanceof Character; } }
    static class A25 { public boolean equals(Object o) { Object x = o; return x instanceof String ss || x instanceof Integer; } }
    static class A26 { public boolean equals(Object o) { return o instanceof final String s; } }
    static class A27 { public boolean equals(Object o) { return o instanceof @Deprecated String s; } }
    static class A28 { public boolean equals(Object o) { return !(o instanceof Integer i) ? false : i > 0; } }
}
