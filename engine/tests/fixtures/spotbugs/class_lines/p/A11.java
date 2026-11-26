package p;
public class A11 implements Cloneable {
    static final boolean DEBUG = false;
    static final boolean ON = true;
    static boolean live;
    int x;
    void m() {
        if (Other.N > 3)
            foo();
        else
            foo2(6);
    }
    static void foo() {
        live = !live;
    }
    static int foo2(int a) {
        return a + 1;
    }
    A11(int y) {
        x = y;
    }
}
