package p;

public class B9 {
    int f;
    void m() {}
    class Mid {
        int g;
        class Leaf extends Base {
            void a() { m(); g++; }
        }
    }
}
