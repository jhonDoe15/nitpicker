package p;
public class A {
    public int a; public int b; public int c; public static int d; public int e; public int f; public int g; public long h;
    public int[] arr;
    void m1() { this.a = 1; }
    void m2() { A.d = 2; }
    void m3() { b += 2; }
    void m4() { c++; }
    void m5(A o) { o.e = 3; }
    void m6() { int[] z = arr; arr[0] = 1; }
    void m7() { for (f = 0; f < 3; f++) { } }
    void m8() { Runnable r = () -> g = 1; }
    void m9() { Object o = new Object() { void q() { h = 1; } }; }
    public static class N { void k(A a) { a.a = 5; } }
}
