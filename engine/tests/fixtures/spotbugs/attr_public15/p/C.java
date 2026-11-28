package p;
public class C {
    enum En { X(C.u2), Y(2); En(int v) {} }
    public static int u2;
    public int w;
    void m() { u2 = 1; w = 1; }
    int[] arr = new int[]{ 1,
      2 };
    Object o = new Object() { public String toString() { return "" + w; } };
}
