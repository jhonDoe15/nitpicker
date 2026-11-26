package p;
import java.util.*;
public class Bc2 {
    public static class C1 { int x; public int hashCode(){return x;}
        public boolean equals(
                Object o)
        {

            if (x > 3)
                return false;
            C1
              b
                = (C1)
                  o;
            return b.x
                == x;
        }
    }
    // catch variants
    public static class T1 { int x; public int hashCode(){return x;} public boolean equals(Object o) { try { T1 b = (T1) o; return b.x == x; } catch (Throwable e) { return false; } } }
    public static class T2 { int x; public int hashCode(){return x;} public boolean equals(Object o) { try { T2 b = (T2) o; return b.x == x; } catch (IllegalStateException e) { return false; } } }
    public static class T3 { int x; public int hashCode(){return x;} public boolean equals(Object o) { try { T3 b = (T3) o; return b.x == x; } finally { x++; } } }
    public static class T4 { int x; public int hashCode(){return x;} public boolean equals(Object o) { try { T4 b = (T4) o; return b.x == x; } catch (NullPointerException | ClassCastException e) { return false; } } }
    public static class T5 { int x; public int hashCode(){return x;} public boolean equals(Object o) { try { T5 b = (T5) o; return b.x == x; } catch (NullPointerException e) { return false; } } }
    public static class T6 { int x; public int hashCode(){return x;} public boolean equals(Object o) { try { x++; } catch (ClassCastException e) { } T6 b = (T6) o; return b.x == x; } }
    public static class T7 { int x; public int hashCode(){return x;} public boolean equals(Object o) { try { if (o == null) return false; return ((T7) o).x == x; } catch (ClassCastException e) { return false; } } }
    public static class T8 { int x; public int hashCode(){return x;} public boolean equals(Object o) { try { return ((T8) o).x == x; } catch (Exception e) { return false; } } }
    // instanceof placement
    public static class I1 { int x; public int hashCode(){return x;} public boolean equals(Object o) { I1 b = (I1) o; if (!(o instanceof I1)) return false; return b.x == x; } }
    public static class I2 { int x; public int hashCode(){return x;} public boolean equals(Object o) { if (o instanceof Runnable) return true; I2 b = (I2) o; return b.x == x; } }
    public static class I3 { int x; public int hashCode(){return x;} public boolean equals(Object o) { Object p = o; if (!(p instanceof I3)) return false; I3 b = (I3) o; return b.x == x; } }
    public static class I4 { int x; public int hashCode(){return x;} public boolean equals(Object o) { if (o instanceof I4 b) return b.x == x; return false; } }
    public static class I5 { int x; public int hashCode(){return x;} public boolean equals(Object o) { if (!(o instanceof I5 b)) return false; return b.x == x; } }
    public static class I6 { int x; public int hashCode(){return x;} public boolean equals(Object o) { if (o != null && o.getClass().getName().equals(getClass().getName())) { I6 b = (I6) o; return b.x == x; } return false; } }
    public static class I7 { int x; public int hashCode(){return x;} public boolean equals(Object o) { if (o != null) { System.out.println(o.getClass()); } I7 b = (I7) o; return b.x == x; } }
    public static class I8 { int x; public int hashCode(){return x;} public boolean equals(Object o) { if (!super.equals(o)) return false; I8 b = (I8) o; return b.x == x; } }
    public static class I9 { int x; public int hashCode(){return x;} public boolean equals(Object o) { if (o == null || o.getClass() != getClass()) return false; I9 b = (I9) o; return b.x == x; } }
    public static class I10 { int x; public int hashCode(){return x;} public boolean equals(Object o) { if (o == null || getClass() != o.getClass()) return false; return ((I10) o).x == x; } }
    public static class I11 { int x; public int hashCode(){return x;} public boolean equals(Object o) { switch (o) { case I11 b: return b.x == x; default: return false; } } }
    // instanceof on a field of o
    public static class I12 { int x; Object f; public int hashCode(){return x;} public boolean equals(Object o) { I12 b = (I12) o; if (b.f instanceof String) return true; return b.x == x; } }
    // different cast types
    public static class K1 { int x; public int hashCode(){return x;} public boolean equals(Object o) { int[] a = (int[]) o; return a.length == x; } }
    public static class K2 { int x; public int hashCode(){return x;} public boolean equals(Object o) { Map<String,String> m = (Map<String,String>) o; return m.size() == x; } }
    public static class K3 { int x; public int hashCode(){return x;} public boolean equals(Object o) { Number n = (Number) o; return n.intValue() == x; } }
    public static class K4 { int x; public int hashCode(){return x;} public boolean equals(Object o) { Integer n = (Integer) o; return n == x; } }
    // checkcast on other value, not param
    public static class K5 { int x; Object f; public int hashCode(){return x;} public boolean equals(Object o) { String s = (String) f; return s != null; } }
    // param not object: equals(Object) with extra params / generic
    public static class K6 { int x; public int hashCode(){return x;} public boolean equals(Object o, int y) { K6 b = (K6) o; return b.x == x; } }
    // static helper called equals(Object)? (static)
    public static class K7 { int x; public static boolean equals(Object o, Object p) { return ((K7) o).x == ((K7) p).x; } }
    // cast result a different object after reassigning o
    public static class K8 { int x; public int hashCode(){return x;} public boolean equals(Object o) { o = new K8(); K8 b = (K8) o; return b.x == x; } }
    // interface default? class implementing; abstract class
    public static abstract class K9 { int x; public int hashCode(){return x;} public boolean equals(Object o) { K9 b = (K9) o; return b.x == x; } }
    public interface K10 { default boolean same(Object o) { return ((K10) o) == this; } }
    // package-private, protected equals?  equals must be public. 
    // generic method typed cast (T) o
    public static class K11<T> { T x; public int hashCode(){return 1;} @SuppressWarnings("unchecked") public boolean equals(Object o) { T t = (T) o; return t == x; } }
    // cast in other overloaded equals path of same name
    public static class K12 { int x; public int hashCode(){return x;} public boolean equals(Object o) { return o == this; } public boolean equals(K12 o){ return ((K12) (Object) o).x == x; } }
    // nested equals in inner class of equals
    public static class K13 { int x; public int hashCode(){return x;} public boolean equals(Object o) { return new Object(){ boolean m() { return ((K13) o) != null; } }.m(); } }
    // two casts, first guarded by instanceof, second not
    public static class K14 { int x; public int hashCode(){return x;} public boolean equals(Object o) { if (o instanceof K14) { return ((K14) o).x == x; } return ((K14) o) == null; } }
    // cast then equals returns (o == this) first
    // cast to generic type param bound
    // equals returns on null then casts in else branch of instanceof
    public static class K15 { int x; public int hashCode(){return x;} public boolean equals(Object o) { if (o instanceof K15) { return true; } else { K15 b = (K15) o; return b == null; } } }
}
