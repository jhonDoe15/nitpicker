package p;
public class P1 {
    String s;
    P1(int t, Object o) {
        for (int i = 0; i < t; i++) { init(); }
        System.out.println(s);
    }
    void init() {}
}
