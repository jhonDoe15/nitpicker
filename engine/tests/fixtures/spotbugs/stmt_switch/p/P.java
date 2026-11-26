package p;
public class P {
    int x;
    sealed interface F permits A, B {}
    record A(int v) implements F {}
    record B(int v) implements F {}
    void p1(int i, F f) {
        switch (i) {
            case 1 -> x = 1;
            case 2 -> {
            }
        }
    }
    void p2(int i, F f) {
        switch (i) {
            case 1:
                x = 1;
                break;
            case 2:
        }
    }
    void p3(int i, F f) {
        switch (i) {
            case 1 -> {
            }
            case 2 -> x = 2;
        }
    }
    void p4(int i, F f) {
        switch (f) {
            case A a -> x = a.v();
            case B b -> x = b.v() + 1;
            case null -> {
            }
        }
    }
    void p5(int i, F f) {
        switch (f) {
            case A a -> x = a.v();
            case B b -> x = b.v() + 1;
        }
    }
    void p6(int i, F f) {
        switch (i) {
            case 1 -> x = 1;
            case 2 -> x = 3;
            default -> {
            }
        }
    }
}
