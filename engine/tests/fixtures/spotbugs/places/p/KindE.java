package p;
public enum KindE {
    X(Math.random()), Y;
    Object o = new java.util.Random();
    static Object s = new java.util.Random();
    KindE() { Math.random(); }
    KindE(double d) { Math.random(); }
    void m() { Math.random(); }
}
