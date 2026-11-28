package p;
public class V3 implements Cloneable {
    static final int M = 2147483647;
    static final String S = "true";
    static boolean live;
    Object o;
    int x;
    void m() {
        int v = true
            ? x
            : 2;
        x = v;
    }
    static void foo() {
        live = !live;
    }
    V3(int y) {
        x = y;
    }
}
