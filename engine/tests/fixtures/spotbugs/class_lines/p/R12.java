package p;
public class R12 implements Cloneable {
    static boolean live;
    int x;
    Object m() {
        String s = x
            > 0 ? (live ? "a" : "b") : "c";
        s.hashCode();
        return null;
    }
    static int one() {
        return 1;
    }
    static int foo2(int a) {
        return a + 1;
    }
    R12(int y) {
        x = y;
    }
}
