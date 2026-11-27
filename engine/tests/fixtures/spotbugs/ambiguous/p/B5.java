package p;

public class B5 {
    int f;
    void m() {}
    void twice() {}
    class In extends Base {
        void a() {
            m();
            m();
            twice();
            f++;
        }
        void b() { m(); }
    }
}
