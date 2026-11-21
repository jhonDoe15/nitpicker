package e;
class Var {
    static void v(int... a) {}
    void use() { v(); v(1); v(1, 2); }
}
