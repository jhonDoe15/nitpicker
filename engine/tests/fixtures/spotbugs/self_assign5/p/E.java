package p;
public enum E {
    A;
    int ef;
    E() { int ef = 1; ef = ef; use(ef); }
    static void use(int x) {}
}
