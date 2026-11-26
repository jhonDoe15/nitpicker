package p;
import java.util.*;
public class Pre {
    public static class U1 { int x; Object f; boolean chk(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { if (o.hashCode() == 0) return false; U1 b = (U1) o; return b.x == x; } }
    public static class U2 { int x; Object f; boolean chk(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { if (o.toString() == null) return false; U2 b = (U2) o; return b.x == x; } }
    public static class U3 { int x; Object f; boolean chk(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { if (Objects.equals(o, null)) return false; U3 b = (U3) o; return b.x == x; } }
    public static class U4 { int x; Object f; boolean chk(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { if (chk(o)) return false; U4 b = (U4) o; return b.x == x; } }
    public static class U5 { int x; Object f; boolean chk(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { this.f = o; U5 b = (U5) o; return b.x == x; } }
    public static class U6 { int x; Object f; boolean chk(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { if (o.equals(this)) return true; U6 b = (U6) o; return b.x == x; } }
    public static class U7 { int x; Object f; boolean chk(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { if (o == null) return false; U7 b = (U7) o; return b.x == x; } }
    public static class U8 { int x; Object f; boolean chk(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { Objects.requireNonNull(o); U8 b = (U8) o; return b.x == x; } }
    public static class U9 { int x; Object f; boolean chk(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { if (this == o) return true; if (o == null) return false; U9 b = (U9) o; return b.x == x; } }
    public static class U10 { int x; Object f; boolean chk(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { Object p = o; if (p == null) return false; U10 b = (U10) o; return b.x == x; } }
    public static class U11 { int x; Object f; boolean chk(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { if (o instanceof Object) {} U11 b = (U11) o; return b.x == x; } }
    public static class U12 { int x; Object f; boolean chk(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { Class<?> c = o.getClass(); U12 b = (U12) o; return b.x == x; } }
    public static class U13 { int x; Object f; boolean chk(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { if (o instanceof U13 || o == null) {} U13 b = (U13) o; return b.x == x; } }
    public static class U14 { int x; Object f; boolean chk(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { if (o != null && o instanceof Comparable) return true; U14 b = (U14) o; return b.x == x; } }
    public static class U15 { int x; Object f; boolean chk(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { synchronized (o) { } U15 b = (U15) o; return b.x == x; } }
    public static class U16 { int x; Object f; boolean chk(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { Object[] arr = {o}; U16 b = (U16) o; return b.x == x; } }
    public static class U17 { int x; Object f; boolean chk(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { String s = String.valueOf(o); U17 b = (U17) o; return b.x == x; } }
    public static class U18 { int x; Object f; boolean chk(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { if (!(o instanceof U18) && o != this) return false; U18 b = (U18) o; return b.x == x; } }
    public static class U19 { int x; Object f; boolean chk(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { int h = System.identityHashCode(o); U19 b = (U19) o; return b.x == x; } }
    public static class U20 { int x; Object f; boolean chk(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { if (!Objects.equals(f, o)) return false; U20 b = (U20) o; return b.x == x; } }
}
