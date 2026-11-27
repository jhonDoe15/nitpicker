package p;
public class A {
    static void main(int a) { System.exit(1); }
    void main(String a) { System.exit(1); }
    private void main(String[] a, int q) { System.exit(1); }
    private static void main(String[] a) { System.exit(1); }
    protected int main(long l) { System.exit(1); return 1; }
    private int main() { System.exit(1); return 1; }
    private static void main2() { System.exit(1); }
    void mainx() { System.exit(1); }
    void xmain() { System.exit(1); }
    void Main() { System.exit(1); }
}
