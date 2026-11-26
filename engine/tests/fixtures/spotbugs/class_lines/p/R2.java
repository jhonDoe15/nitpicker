package p;
public class R2 implements Cloneable {
    static boolean live;
    int x;
    Object m() {
        int y;
        y = x
            > 0 ? 1 : 2;
        foo2(y);
        return null;
    }
    static int one() {
        return 1;
    }
    static int foo2(int a) {
        return a + 1;
    }
    R2(int y) {
        x = y;
    }
}
