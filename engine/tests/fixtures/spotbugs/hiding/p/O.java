package p;
public class O {
    public static class N1 extends A {
        public static void f() {
            System.gc();
        }
    }
    static class N2 extends A {
        static void h() {
            System.gc();
        }
    }
    void m() {
        class L extends A {
            public static void f() {
                System.gc();
            }
        }
        new L();
    }
}
