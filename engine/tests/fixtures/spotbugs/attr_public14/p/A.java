package p;
public class A {
    public int d;
    void m2() {
        switch (d) {
            case 1 -> d = 1;
            default -> { }
        }
    }
}
