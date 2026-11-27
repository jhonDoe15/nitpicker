package p;
public class C {
    class In { final int v = Integer.parseInt("2"); }
    static class Sn { int v; { v = Integer.parseInt("3"); } }
    Object make(int k) { return new Object() { int w = Integer.parseInt("4"); }; }
}
