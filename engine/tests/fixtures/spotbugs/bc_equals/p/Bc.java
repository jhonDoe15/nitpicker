package p;
import java.util.*;
public class Bc {
    // 1 direct cast
    public static class B1 { int x; public boolean equals(Object o) { B1 b = (B1) o; return b.x == x; } public int hashCode(){return x;} }
    // 2 getClass check first
    public static class B2 { int x; public boolean equals(Object o) { if (o == null || getClass() != o.getClass()) return false; B2 b = (B2) o; return b.x == x; } public int hashCode(){return x;} }
    // 3 instanceof first
    public static class B3 { int x; public boolean equals(Object o) { if (!(o instanceof B3)) return false; B3 b = (B3) o; return b.x == x; } public int hashCode(){return x;} }
    // 4 cast via local
    public static class B4 { int x; public boolean equals(Object o) { Object p = o; B4 b = (B4) p; return b.x == x; } public int hashCode(){return x;} }
    // 5 instanceof on different thing
    public static class B5 { int x; Object other; public boolean equals(Object o) { if (!(other instanceof B5)) return false; B5 b = (B5) o; return b.x == x; } public int hashCode(){return x;} }
    // 6 try/catch ClassCastException
    public static class B6 { int x; public boolean equals(Object o) { try { B6 b = (B6) o; return b.x == x; } catch (ClassCastException e) { return false; } } public int hashCode(){return x;} }
    // 7 helper method
    public static class B7 { int x; public boolean equals(Object o) { return same((B7) o); } boolean same(B7 b){return b.x==x;} public int hashCode(){return x;} }
    public static class B7b { int x; public boolean equals(Object o) { return helper(o); } boolean helper(Object o){ B7b b = (B7b) o; return b.x==x;} public int hashCode(){return x;} }
    // 8 delegating equals(Object) to typed equals
    public static class B8 { int x; public boolean equals(Object o) { return equals((B8) o); } public boolean equals(B8 b) { return b.x == x; } public int hashCode(){return x;} }
    // 9 cast to a different type than own class
    public static class B9 { int x; public boolean equals(Object o) { String s = (String) o; return s.length() == x; } public int hashCode(){return x;} }
    // 10 cast to superclass / interface
    public static class B10 { int x; public boolean equals(Object o) { Comparable c = (Comparable) o; return c.hashCode() == x; } public int hashCode(){return x;} }
    // 11 cast to Object (no-op) 
    public static class B11 { int x; public boolean equals(Object o) { Object c = (Object) o; return c == this; } public int hashCode(){return x;} }
    // 12 cast a subclass of own type
    public static class B12 { int x; public boolean equals(Object o) { B12Sub s = (B12Sub) o; return s.x == x; } public int hashCode(){return x;} }
    public static class B12Sub extends B12 { }
    // 13 cast a superclass of own
    public static class B13 extends B12 { public boolean equals(Object o) { B12 s = (B12) o; return s.x == x; } public int hashCode(){return x;} }
    // 14 instanceof for different class then cast
    public static class B14 { int x; public boolean equals(Object o) { if (o instanceof String) return false; B14 b = (B14) o; return b.x == x; } public int hashCode(){return x;} }
    // 15 null check only
    public static class B15 { int x; public boolean equals(Object o) { if (o == null) return false; B15 b = (B15) o; return b.x == x; } public int hashCode(){return x;} }
    // 16 this == o check only
    public static class B16 { int x; public boolean equals(Object o) { if (this == o) return true; B16 b = (B16) o; return b.x == x; } public int hashCode(){return x;} }
    // 17 getClass().equals
    public static class B17 { int x; public boolean equals(Object o) { if (o == null || !getClass().equals(o.getClass())) return false; B17 b = (B17) o; return b.x == x; } public int hashCode(){return x;} }
    // 18 o.getClass() == B18.class
    public static class B18 { int x; public boolean equals(Object o) { if (o == null || o.getClass() != B18.class) return false; B18 b = (B18) o; return b.x == x; } public int hashCode(){return x;} }
    // 19 Class.isInstance
    public static class B19 { int x; public boolean equals(Object o) { if (!B19.class.isInstance(o)) return false; B19 b = (B19) o; return b.x == x; } public int hashCode(){return x;} }
    // 20 cast after try-instanceof in a ternary
    public static class B20 { int x; public boolean equals(Object o) { return o instanceof B20 ? ((B20) o).x == x : false; } public int hashCode(){return x;} }
    // 21 cast inside a loop / conditional
    public static class B21 { int x; public boolean equals(Object o) { if (x > 0) { B21 b = (B21) o; return b.x == x; } return false; } public int hashCode(){return x;} }
    // 22 cast in lambda
    public static class B22 { int x; public boolean equals(Object o) { java.util.function.Supplier<B22> s = () -> (B22) o; return s.get().x == x; } public int hashCode(){return x;} }
    // 23 cast twice
    public static class B23 { int x; public boolean equals(Object o) { B23 b = (B23) o; B23 c = (B23) o; return b.x == c.x; } public int hashCode(){return x;} }
    // 24 generic class cast to B24<?>
    public static class B24<T> { T x; public boolean equals(Object o) { B24<?> b = (B24<?>) o; return Objects.equals(b.x, x); } public int hashCode(){return 1;} }
    public static class B24b<T> { T x; @SuppressWarnings("unchecked") public boolean equals(Object o) { B24b<T> b = (B24b<T>) o; return Objects.equals(b.x, x); } public int hashCode(){return 1;} }
    // 25 cast not used afterwards
    public static class B25 { int x; public boolean equals(Object o) { B25 b = (B25) o; return true; } public int hashCode(){return x;} }
    // 26 cast whose result is only passed on
    public static class B26 { int x; public boolean equals(Object o) { return Objects.equals(this, (B26) o); } public int hashCode(){return x;} }
    // 27 non-public equals / equals not overriding (different param)
    public static class B27 { int x; public boolean equals(B27 o) { B27 b = (B27) (Object) o; return b.x == x; } }
    // 28 equals(Object) with final
    public static class B28 { int x; public final boolean equals(Object o) { B28 b = (B28) o; return b.x == x; } public int hashCode(){return x;} }
    // 29 static equals(Object)? 
    // 30 enum / record
    public record B30(int x) { public boolean equals(Object o) { B30 b = (B30) o; return b.x == x; } }
    public enum B31 { A; }
    // 32 anonymous
    static Object anon = new Object() { public boolean equals(Object o) { return ((String) o).length() == 1; } public int hashCode(){return 1;} };
    // 33 cast and instanceof of same *subtype* check but other variable, e.g. check on parameter field
    // 34 equals with try/catch Exception
    public static class B34 { int x; public boolean equals(Object o) { try { B34 b = (B34) o; return b.x == x; } catch (Exception e) { return false; } } public int hashCode(){return x;} }
    // 35 catch ClassCastException but cast outside try
    public static class B35 { int x; public boolean equals(Object o) { B35 b = (B35) o; try { return b.x == x; } catch (ClassCastException e) { return false; } } public int hashCode(){return x;} }
    // 36 catch RuntimeException
    public static class B36 { int x; public boolean equals(Object o) { try { B36 b = (B36) o; return b.x == x; } catch (RuntimeException e) { return false; } } public int hashCode(){return x;} }
}
