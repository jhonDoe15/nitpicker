package p;
public class C3 implements Cloneable {
    static final boolean DEBUG = false;
    static final boolean ON = true;
    static boolean live;
    int x;
    void m() {
        try {
        } catch (RuntimeException e) {
            foo();
        }
        foo2(8);
    }
    static void foo() {
        live = !live;
    }
    static int foo2(int a) {
        return a + 1;
    }
    C3(int y) {
        x = y;
    }
}
