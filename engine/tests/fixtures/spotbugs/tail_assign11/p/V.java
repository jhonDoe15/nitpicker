package p;
public class V { int f, g;
    void a1() { f = f; }
    void k1() { synchronized (this) { f = f; } f = f; }
    void a2() { f = f; }
    void k2() { synchronized (this) { f = f; } f = f; }
    void a3() { f = f; }
    void k3() { synchronized (this) { f = f; } f = f; }
    void a4() { f = f; }
    Object[] read() { return new Object[] { f }; }
}
