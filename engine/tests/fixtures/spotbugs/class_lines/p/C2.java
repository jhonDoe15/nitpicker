package p;
public class C2 implements Cloneable {
    static final boolean DEBUG = false;
    static final boolean ON = true;
    static boolean live;
    int x;
    void m() {
        try {
            // nothing
        } finally {
            foo();
        }
        foo2(7);
    }
    static void foo() {
        live = !live;
    }
    static int foo2(int a) {
        return a + 1;
    }
    C2(int y) {
        x = y;
    }
}
