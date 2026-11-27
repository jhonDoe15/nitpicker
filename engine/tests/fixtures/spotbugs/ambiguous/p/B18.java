package p;

public class B18 {
    int f;
    void m() {}
    class In extends Base {
        In() { m(); f++; }
        int z = f;
    }
}
