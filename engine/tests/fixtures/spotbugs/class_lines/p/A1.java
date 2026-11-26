package p;
public class A1 implements Cloneable {
    static final boolean DEBUG = false;
    static final boolean ON = true;
    static boolean live;
    int x;
    void m() {
        if (DEBUG)
            foo();
        else
            foo2(1);
    }
    static void foo() {
        live = !live;
    }
    static int foo2(int a) {
        return a + 1;
    }
    A1(int y) {
        x = y;
    }
}
