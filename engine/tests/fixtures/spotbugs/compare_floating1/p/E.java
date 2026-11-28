package p;
class E1 {
    public boolean equals(Object o) { Class<?> c = String.class; return c.isInstance(o); }
}
class E2 {
    public boolean equals(Object o) { return String.class.cast(o) != null; }
}
class E3 {
    public boolean equals(Object o) { return o.getClass().equals(String.class); }
}
class E4 {
    public boolean equals(Object o) { return String.class == o.getClass(); }
}
class E5 {
    public boolean equals(Object o) { Object k = String.class; return k == o; }
}
class E6 {
    public boolean equals(Object o) { return Integer.class.isInstance(this); }
}
class E7 {
    Object f;
    public boolean equals(Object o) { return f instanceof String; }
}
class E8 {
    public boolean equals(Object o) {
        if (!(o instanceof E8)) return false;
        E8 e = (E8) o;
        return e.toString() instanceof String;
    }
}
class E9 {
    public boolean equals(Object o) { return o instanceof String[]; }
}
class E10 {
    public boolean equals(Object o) {
        return o instanceof java.util.List;
    }
}
final class E11 implements java.util.RandomAccess {
    public boolean equals(Object o) { return o instanceof java.util.List; }
}
abstract class E12 {
    public boolean equals(Object o) { return o instanceof java.util.List; }
}
class E13 {
    public boolean equals(Object o) {
        Object x = null;
        if (o != null) x = o;
        return x instanceof String;
    }
}
class E14 {
    public boolean equals(Object o) { return o instanceof Object[]; }
}
class E15 {
    public boolean equals(Object o) { return o instanceof Comparable && o instanceof Comparable; }
}
enum E16 { A; boolean same(Object o) { return o instanceof String; } }
record E17(int x) { public boolean equals(Object o) { return o instanceof String; } }
interface E18 { default boolean same(Object o) { return o instanceof String; } }
class E19 {
    public boolean equals(Object o) {
        boolean b = o instanceof Integer;
        boolean c = o instanceof Long;
        return b || c;
    }
}
