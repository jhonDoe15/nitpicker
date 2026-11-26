package p;
public class R8 implements Cloneable {
    static boolean live;
    int x;
    Object m() {
        foo2(x
            > 0 ? 1 : 2);
        return null;
    }
    static int one() {
        return 1;
    }
    static int foo2(int a) {
        return a + 1;
    }
    R8(int y) {
        x = y;
    }
}
