package p;
public class V { int f, g; V o; long l; static int st;
    void a1() { f = ++f; }
    void a2() { f = f--; }
    void a3() { this.f = this.f++; }
    void a4() { o.f = o.f++; }
    void a5(V v) { v.f = v.f++; }
    void a6() { l = l++; }
    void a7() { f = f; }
    void a8() { f = (f = f); }
    void a9() { int x = f++; f = x; }
    void a10() { st = st++; }
    void a11() { f = f += 1; }
    void a12() { f = g++; }
}
