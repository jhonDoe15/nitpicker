package p;
public class V { int f, g;
    void a1() {
        f = f;
        synchronized (this) {
            f = f;
        }
        f = f;
        synchronized (this) {
            f = f;
        }
        f = f;
    }
    void a2() { 
        f = f;
    }
    Object[] read() { return new Object[] { f }; }
}
