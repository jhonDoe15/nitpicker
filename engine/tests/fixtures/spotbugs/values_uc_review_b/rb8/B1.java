package rb8;
public class B1 {
    int f; int g;
    void a(boolean p) {
        if (f > 3) { return; }
        if (p) {
            if (f > 3) { System.out.println(1); }
        } else {
            if (f > 3) { System.out.println(2); }
        }
    }
    void b(boolean p) {
        if (f > 3) { return; }
        if (p) {
            if (f > 3) { System.out.println(1); }
        }
        if (f > 3) { System.out.println(2); }
    }
    void c() {
        if (f > 3) { return; }
        if (f > 3) { System.out.println(1); }
        if (f < 4) { System.out.println(3); }
    }
    void d() {
        if (f > 3) { return; }
        for (int i = 0; i < 3; i++) {
            if (f > 3) { System.out.println(1); }
        }
        if (f > 3) { System.out.println(2); }
    }
    void e() {
        if (f > 3) { return; }
        if (f > 3) { System.out.println(1); }
        if (f > 3) { System.out.println(2); }
        if (f > 3) { System.out.println(3); }
    }
}
