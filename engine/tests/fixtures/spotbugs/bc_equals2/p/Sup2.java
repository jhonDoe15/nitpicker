package p;
import java.util.*;
public class Sup2 {
    public static class E1 extends Sup { int x; Object f; boolean equals0(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { if (f.equals(o)) return true; E1 b = (E1) o; return b.x == x; } }
    public static class E2 extends Sup { int x; Object f; boolean equals0(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { if (this.equals0(o)) return true; E2 b = (E2) o; return b.x == x; } }
    public static class E3 extends Sup { int x; Object f; boolean equals0(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { if (super.hashCode() == 0 && super.equals(this)) return true; E3 b = (E3) o; return b.x == x; } }
    public static class E4 extends Sup { int x; Object f; boolean equals0(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { if (new Object().equals(o)) return true; E4 b = (E4) o; return b.x == x; } }
    public static class E5 extends Sup { int x; Object f; boolean equals0(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { if (o == f || o != f) return true; E5 b = (E5) o; return b.x == x; } }
    public static class E6 extends Sup { int x; Object f; boolean equals0(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { if (!(super.toString() == null)) return true; E6 b = (E6) o; return b.x == x; } }
    public static class E7 extends Sup { int x; Object f; boolean equals0(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { if (super.same(o)) return true; E7 b = (E7) o; return b.x == x; } }
    public static class E8 extends Sup { int x; Object f; boolean equals0(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { if (!super.equals((Object) f)) return true; E8 b = (E8) o; return b.x == x; } }
    public static class E9 extends Sup { int x; Object f; boolean equals0(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { if (super.equals(o)) return true; E9 b = (E9) o; return b.x == x; } }
    public static class Sup { public boolean same(Object o){return true;} public boolean equals(Object o){return true;} public int hashCode(){return 1;} }
}
