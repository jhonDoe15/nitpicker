package rb2;
public class B1 {
    int f;
    void poke() { f = 4; }
    void a() {
        if (f > 3) { return; }
        new C1();
        if (f > 3) { System.out.println("x"); }
    }
    void b() {
        if (f > 3) { return; }
        new C2(this);
        if (f > 3) { System.out.println("x"); }
    }
    void c() {
        if (f > 3) { return; }
        new C3();
        if (f > 3) { System.out.println("x"); }
    }
    void d() {
        if (f > 3) { return; }
        new C4();
        if (f > 3) { System.out.println("x"); }
    }
    void e() {
        if (f > 3) { return; }
        ping(2);
        if (f > 3) { System.out.println("x"); }
    }
    void ping(int n) { if (n > 0) pong(n - 1); }
    void pong(int n) { if (n > 0) ping(n - 1); }
    void g() {
        if (f > 3) { return; }
        loop(2);
        if (f > 3) { System.out.println("x"); }
    }
    int loop(int n) { return n <= 0 ? 0 : loop(n - 1) + 1; }
    void h() {
        if (f > 3) { return; }
        loop2(2);
        if (f > 3) { System.out.println("x"); }
    }
    void loop2(int n) { if (n > 0) { System.out.println(n); } }
}
class C1 { }
class C2 { C2(B1 b) { } }
class C3 { int z; C3() { z = 1; } }
class C4 { C4() { System.out.println("a"); } }
