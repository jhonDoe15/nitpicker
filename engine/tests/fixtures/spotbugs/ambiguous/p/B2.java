package p;

public class B2 {
    int f;
    static void m() {}
    class In extends Base {
        void a() { m(); f++; }
    }
}
