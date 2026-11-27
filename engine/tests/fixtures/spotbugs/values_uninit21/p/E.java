package p;
public enum E {
    A(1), B(2);
    int v;
    String s;
    E(int x) { System.out.println(s); v = x; }
}
