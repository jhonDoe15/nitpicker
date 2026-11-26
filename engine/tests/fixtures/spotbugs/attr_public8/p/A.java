package p;
public class A {
    public int h1, h2, h3, h4, h5, h6, h7, h8;
    public static int s1;
    public A() { i1(); i2(); i3(); i5(); this.i6(); }
    private void i1() { h1 = 1; }
    void i2() { h2 = 1; }
    private void i3() { h3 = 1; i4(); }
    private void i4() { h4 = 1; }
    private void i5() { h5 = 1; }
    void other() { i5(); }
    private void i6() { h6 = 1; }
    private void i7() { h7 = 1; }
    static { st(); }
    private static void st() { s1 = 1; }
    private final void i8() { h8 = 1; }
    A(int x) { Runnable r = this::i8; r.run(); i7(); }
}
