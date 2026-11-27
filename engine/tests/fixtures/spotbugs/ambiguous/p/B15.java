package p;

public class B15 {
    int f;
    void m() {}
    class In extends Base {
        void a() { m(); B15.this.f = 1; }
    }
}
