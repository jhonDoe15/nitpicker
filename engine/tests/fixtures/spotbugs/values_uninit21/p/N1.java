package p;
public class N1<T> {
    String s;
    int h;
    T g;
    N1(int t, Object o) {
        N1 other = (N1) o; other.s = "a"; System.out.println(s);
    }
}
