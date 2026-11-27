package p;

public class B11 {
    int f;
    void m() {}
    void use() {
        new Base() { void a() { m(); f++; } };
    }
}
