package p;
public class A {
    Boolean f;
    void anon(Boolean a) {
        Object o = new Object() {
            Boolean w;
            boolean y1(Boolean c) { return c == a; }
            boolean y2(Boolean c) { return a == c; }
            boolean y3(Boolean c) { return w == c; }
            boolean y4(Boolean c) { return c == w; }
            boolean y5() { return a == w; }
            boolean y6() { return w == a; }
            boolean y7(Boolean c) { return c == f; }
            boolean y8(Boolean c) { return f == c; }
            boolean y9(Boolean c) { return c == this.w; }
        };
    }
    boolean p1(Boolean c) { return c == f; }
    boolean p2(Boolean c) { return f == c; }
}
