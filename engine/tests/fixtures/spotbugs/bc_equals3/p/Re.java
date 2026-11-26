package p;

public class Re {
    static class B17 {
        int x;

        public boolean equals(Object o) {
            Object q = o;
            q = "s";
            return ((B17) q).x == x;
        }
    }

    static class B18 {
        int x;

        public boolean equals(Object o) {
            Object q = "s";
            q = o;
            return ((B18) q).x == x;
        }
    }
}
