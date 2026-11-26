package p;
public class B {
    static int x = A.f1;
    static { A.f2 = 2; }
    static int y = A.f3 + 1;
    static int z = A.f4 + A.f5 + A.f6;
}
