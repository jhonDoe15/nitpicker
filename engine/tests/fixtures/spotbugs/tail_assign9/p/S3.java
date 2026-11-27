package p;
public class S3 {
    int f, g; static int st;
    void m() { }
    void a1() { int x = f; f = x; }
    void k(boolean c) { int x = f; while (c) { c = g > 0; } f = x; }
    void a2() { int x = f; f = x; }
    void a3() { f = f; }
}
