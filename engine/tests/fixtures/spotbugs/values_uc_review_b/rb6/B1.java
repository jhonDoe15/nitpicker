package rb6;
public class B1 {
    int f; char c;
    void o() {
        if (f > 3) { return; }
        if (f > 3) { return; }
        if (f > 3) { System.out.println(); }
    }
    void o2() {
        if (f > 3) { return; }
        if (f > 3) { System.out.println(); }
        if (f > 3) { System.out.println(); }
    }
    void z4() { if (c == '\u0080') { if (c != '\u0080') { System.out.println(); } } }
    void z5() { if (c == 128) { if (c != 128) { System.out.println(); } } }
    void z6() { if (f == 128) { if (f != 128) { System.out.println(); } } }
    void z7() { if (c == '\u0081') { if (c != '\u0081') { System.out.println(); } } }
    void z8() { if (c == ' ') { if (c != ' ') { System.out.println(); } } }
    void z9() { if (c == 'Ā') { if (c != 'Ā') { System.out.println(); } } }
    void za() { if (c == 'é') { if (c != 'é') { System.out.println(); } } }
    void zb() { if (c > 200) { if (c < 100) { System.out.println(); } } }
}
