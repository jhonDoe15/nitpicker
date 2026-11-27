package h;
import org.missing.Unknown;
class Overloads {
    private void va(int... a) {}
    private void va(Object... a) {}
    private void vb(long... a) {}
    private void vb(Integer... a) {}
    private void vc(int a, Object... b) {}
    private void vc(int a, String... b) {}
    private void vd(String s, int... a) {}
    private void vd(String s, Object... a) {}
    private void ue(int a) {}
    private void ue(String a) {}
    private void uf(Object a) {}
    private void uf(String a) {}
    private void ug(String a, int b) {}
    private void ug(Integer a, int b) {}
    private void uh(long a) {}
    private void uh(int a) {}
    private void ui(String a) {}
    private void ui(int a) {}
    private void uj(String a, Object b) {}
    private void uj(Object a, String b) {}
    void use(Unknown u) {
        ui(u.foo());
        uj(u.foo(), u.bar());
        va(1, 2);
        vb(1, 2);
        vc(1);
        vd("x");
        ue(u.foo());
        uf(u.foo());
        ug(u.foo(), 1);
        uh(u.foo());
    }
}
class OverloadsMore {
    private void s1(Foo f) {}
    private void s4(Foo f, int a) {}
    private void s4(Foo f, String a) {}
    private void m2(int... a) {}
    private void m2(int a, int... b) {}
    void go(Foo f, Bar b) {
        s1(f);
        s4(b, 1);
        s4(f, "x");
        m2(1, 2);
    }
}
