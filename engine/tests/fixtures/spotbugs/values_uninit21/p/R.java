package p;
public class R<T> {
    T g;
    R(T x) { System.out.println(g); g = x; }
    R(Object x, int y) { System.out.println(g); g = (T) x; }
}
