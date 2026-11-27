package p;
public class N10<T> {
    String s;
    int h;
    T g;
    N10(int t, Object o) {
        class Loc { void m() { System.out.println(s); } } new Loc().m(); System.out.println(h);
    }
}
