package p;
public class V4 implements Cloneable {
    static final int M = 2147483647;
    static final String S = "true";
    static boolean live;
    Object o;
    int x;
    void m() {
        int v = false ? 1 : x
            > 0 ? 2 : 3;
        x = v;
    }
    static void foo() {
        live = !live;
    }
    V4(int y) {
        x = y;
    }
}
