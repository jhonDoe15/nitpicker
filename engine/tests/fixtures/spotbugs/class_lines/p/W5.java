package p;
public class W5 implements Cloneable {
    static final int A = 1, B = 3, SH = 1 << 3;
    static final String CS = "c";
    int x;
    void m() {
        String t = "a" + "b" +
            sc();
        x = t.length();
    }
    static String sc() {
        return "s";
    }
    W5(int y) {
        x = y;
    }
}
