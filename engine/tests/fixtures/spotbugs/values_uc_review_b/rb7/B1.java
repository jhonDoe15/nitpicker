package rb7;
public class B1 {
    int f; int g;
    void a() {
        if (f > 3) { return; }
        if (f > 3) { System.out.println(1); }
        if (f > 4) { System.out.println(2); }
    }
    void b() {
        if (f > 3) { return; }
        if (f > 3) { System.out.println(1); }
        if (g > 3) { return; }
        if (g > 3) { System.out.println(2); }
    }
    void c() {
        if (f > 3) { return; }
        if (f > 3) { System.out.println(1); }
        System.out.println(5);
        if (f > 3) { System.out.println(2); }
    }
    void d() {
        if (f > 3) { return; }
        if (f > 5) { System.out.println(1); }
        if (f > 3) { System.out.println(2); }
    }
    void e() {
        if (f > 3) { return; }
        if (f > 3) { System.out.println(1); }
        else { System.out.println(0); }
    }
}
