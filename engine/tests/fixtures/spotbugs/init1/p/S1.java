package p;

public class S1 {
    static final S1 A = new Sub1();
    static S1 B;
    static {
        B = Sub1.make();
    }
    static Object C = Sub1.class;
    static Object D = new Sub1[2];
    static int E = Sub1.counter;
    static S1 F = new Sub1.Deeper();
    static final Object G = Other.X;
    static void m() { Object x = new Sub1(); }
    S1() {}
    static class In extends S1 { static int Q = 1; }
    static int H = In.Q;
}
