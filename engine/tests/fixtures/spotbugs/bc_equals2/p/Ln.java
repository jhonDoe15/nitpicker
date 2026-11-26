package p;
public class Ln {
    static boolean both(Object a, int b) { return true; }
    public static class L2 { int x; public int hashCode(){return x;}
        public boolean equals(Object o) {
            int y = ((L2) o).x;
            int z = ((L2) o).x;
            return y == z;
        }
    }
    public static class L3 { int x; public int hashCode(){return x;}
        public boolean equals(Object o) {
            if (x > 0) {
                return ((L3) o).x == 1;
            }
            return ((L3) o).x
                  == 2;
        }
    }
    public static class L5 { int x; public int hashCode(){return x;}
        public boolean equals(Object o) {
            L5 b =
               (L5) o;
            return b.x == x;
        }
    }
    public static class L6 { int x; public int hashCode(){return x;}
        public boolean equals(Object o) {
            L6 b;
            b = (L6)
               o;
            return b.x == x;
        }
    }
}
