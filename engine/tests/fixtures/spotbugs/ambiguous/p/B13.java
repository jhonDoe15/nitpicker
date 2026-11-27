package p;

public class B13 {
    int f;
    void k() {}
    class Sup { void k() {} }
    class In extends Sup {
        void a() { k(); f++; }
    }
}
