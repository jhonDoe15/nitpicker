package p;

public class B20 {
    int f;
    void m() {}
    class In extends Base {
        void a() { this.m(); f++; }
        void b() { In.this.m(); }
    }
}
