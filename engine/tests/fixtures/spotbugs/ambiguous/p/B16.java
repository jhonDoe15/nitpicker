package p;

public class B16 {
    void m() {}
    class Other {}
    class In extends Base {
        void a() { m(); new Other(); }
    }
}
