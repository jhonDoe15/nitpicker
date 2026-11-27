package p;

public class B4 {
    int f;
    void m() {}
    class In extends Base {
        void a() { Runnable r = () -> m(); r.run(); f++; }
    }
}
