package p;

public class B12 {
    int f;
    void hidden() {}
    class In extends Base {
        void a() { hidden(); f++; }
    }
}
