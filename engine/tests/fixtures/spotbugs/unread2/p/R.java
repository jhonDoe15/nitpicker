package p;

public record R(int a) {
    static int sr;
    public R { sr = 1; }
    static void q() { sr = 2; }
}
