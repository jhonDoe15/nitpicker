package p;
public class S {
    int x;
    enum E { A, B, C }
    void s1(int i) { switch (i) { case 1: x = 1; break; case 2: x = 2; break; } }
    void s2(int i) { switch (i) { case 1: x = 1; case 2: x = 2; break; default: x = 3; } }
    void s3(int i) { switch (i) { case 1: case 2: x = 2; break; default: x = 3; } }
    void s4(int i) { switch (i) { case 1: x = 1; break; default: x = 3; } }
    void s5(E e) { switch (e) { case A: x = 1; break; case B: x = 2; break; } }
    void s6(E e) { switch (e) { case A: x = 1; break; case B: x = 2; break; case C: x = 3; break; } }
    void s7(String s) { switch (s) { case "a": x = 1; break; case "b": x = 2; break; } }
    void s8(int i) { switch (i) { case 1 -> x = 1; case 2 -> x = 2; } }
    void s9(int i) { switch (i) { case 1: x = 1; return; case 2: x = 2; break; } }
    void s10(int i) { switch (i) { case 1: x = 1; default: x = 3; } }
    int s11(int i) { switch (i) { case 1: return 1; case 2: return 2; } return 0; }
    void s12(int i) { switch (i) { case 1: throw new IllegalStateException(); case 2: x = 2; break; } }
    void s13(int i) { for (;;) { switch (i) { case 1: x = 1; continue; case 2: x = 2; break; } break; } }
    void s14(int i) { switch (i) { case 1: if (x > 0) { x = 1; break; } case 2: x = 2; break; default: } }
    void s15(int i) { switch (i) { case 1: x = 1; break; case 2: x = 2; } }
    void s16(int i) { switch (i) { case 1: x = 1; break; case 2: x = 2; break; default: } }
    void s17(char c) { switch (c) { case 'a': x = 1; break; case 'b': x = 2; break; } }
    void s18(int i) { switch (i) { case 1: x = 1; break; case 1000: x = 2; break; } }
    int s19(int i) { return switch (i) { case 1 -> 1; default -> 2; }; }
    int s20(E e) { return switch (e) { case A -> 1; case B -> 2; case C -> 3; }; }
    void s21(Object o) { switch (o) { case String s: x = 1; break; default: x = 2; } }
    void s22(int i) { switch (i) { case 1: x = 1; break; case 2: case 3: x = 2; break; } }
    void s23(int i) { switch (i) { case 1: { x = 1; } case 2: x = 2; break; default: x = 3; break; } }
    void s24(int i) { switch (i) { case 1: x = 1; // fall through
        case 2: x = 2; break; default: x = 3; } }
    void s25(int i) { switch (i) { default: x = 3; case 1: x = 1; break; } }
    void s26(int i) { switch (i) { case 1: x = 1; break; } }
    void s27(int i) {
        switch (i) {
            case 1:
                x = 1;
            case 2:
                x = 2;
                break;
            default:
                x = 4;
        }
    }
    void s28(int i) {
        switch (i) {
            case 1:
                x = 1;
                break;
            case 2:
                x = 2;
        }
    }
}
