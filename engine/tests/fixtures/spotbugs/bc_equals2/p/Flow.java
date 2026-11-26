package p;
import java.util.*;
public class Flow {
    public static class S1 extends Sup { int x; Object f; boolean same(Object o){return false;} boolean equals0(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { if (!super.equals(o)) return false; S1 b = (S1) o; return b.x == x; } }
    public static class S2 extends Sup { int x; Object f; boolean same(Object o){return false;} boolean equals0(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { return super.equals(o) && ((S2) o).x == x; } }
    public static class S3 { int x; Object f; boolean same(Object o){return false;} boolean equals0(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { if (this.same(o)) return true; S3 b = (S3) o; return b.x == x; } }
    public static class S4 { int x; Object f; boolean same(Object o){return false;} boolean equals0(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { if (x > 0) { if (o instanceof S4) return true; return false; } else { S4 b = (S4) o; return b.x == x; } } }
    public static class S5 { int x; Object f; boolean same(Object o){return false;} boolean equals0(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { synchronized (this) { S5 b = (S5) o; return b.x == x; } } }
    public static class S6 { int x; Object f; boolean same(Object o){return false;} boolean equals0(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { try (java.io.StringReader r = new java.io.StringReader("")) { S6 b = (S6) o; return b.x == x; } catch (Exception e) { return false; } } }
    public static class S7 { int x; Object f; boolean same(Object o){return false;} boolean equals0(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { try { x++; } catch (RuntimeException e) { S7 b = (S7) o; return b.x == x; } return false; } }
    public static class S8 { int x; Object f; boolean same(Object o){return false;} boolean equals0(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { try { x++; } finally { S8 b = (S8) o; return b.x == x; } } }
    public static class S9 { int x; Object f; boolean same(Object o){return false;} boolean equals0(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { if (o instanceof S9) { } S9 b = (S9) o; return b.x == x; } }
    public static class S10 { int x; Object f; boolean same(Object o){return false;} boolean equals0(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { Object p = o; if (p.getClass() != getClass()) return false; S10 b = (S10) o; return b.x == x; } }
    public static class S11 { int x; Object f; boolean same(Object o){return false;} boolean equals0(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { S11 b = (S11) o; if (b.getClass() != getClass()) return false; return b.x == x; } }
    public static class S12 { int x; Object f; boolean same(Object o){return false;} boolean equals0(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { S12 b = (S12) o; return b.x == x && b.getClass() == getClass(); } }
    public static class S13 { int x; Object f; boolean same(Object o){return false;} boolean equals0(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { if (o.getClass() == null) return false; S13 b = (S13) o; return b.x == x; } }
    public static class S14 { int x; Object f; boolean same(Object o){return false;} boolean equals0(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { Object q = f; if (q instanceof S14) return true; S14 b = (S14) o; return b.x == x; } }
    public static class S15 { int x; Object f; boolean same(Object o){return false;} boolean equals0(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { Object q = o; Object r = q; if (r instanceof S15) return true; S15 b = (S15) o; return b.x == x; } }
    public static class S16 { int x; Object f; boolean same(Object o){return false;} boolean equals0(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { boolean ok = o instanceof S16; S16 b = (S16) o; return ok && b.x == x; } }
    public static class S17 { int x; Object f; boolean same(Object o){return false;} boolean equals0(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { return o instanceof S17 && ((S17) o).x == x; } }
    public static class S18 { int x; Object f; boolean same(Object o){return false;} boolean equals0(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { return !(o instanceof S18) ? false : ((S18) o).x == x; } }
    public static class S19 { int x; Object f; boolean same(Object o){return false;} boolean equals0(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { return ((S19) o).x == x; } }
    public static class S20 { int x; Object f; boolean same(Object o){return false;} boolean equals0(Object o){return false;} public int hashCode(){return x;}
        public boolean equals(Object o) { return equals0(((S20) o)); } }
    public static class Sup { public boolean equals(Object o){return true;} public int hashCode(){return 1;} }
}
