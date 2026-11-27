package rb1;
public class B2 {
    int f; static int sf;
    void setF(int v) { f = v; }
    int getF() { return f; }
    void a() {
        if (f > 3) { return; }
        setF(2);
        if (f > 3) { System.out.println("x"); }
    }
    void b() {
        if (f > 3) { return; }
        int q = getF();
        if (f > 3) { System.out.println("y"); }
    }
    void c() {
        if (f > 3) { return; }
        sm();
        if (f > 3) { System.out.println("z"); }
    }
    static void sm() { }
    static void sm2() { sf = 3; }
    void d() {
        if (f > 3) { return; }
        sm2();
        if (f > 3) { System.out.println("z"); }
    }
    void e() {
        if (f > 3) { return; }
        I.run2();
        if (f > 3) { System.out.println("z"); }
    }
    void h() {
        if (f > 3) { return; }
        Runnable r = this::setZ;
        r.run();
        if (f > 3) { System.out.println("z"); }
    }
    void setZ() { f = 8; }
}
