package p;
public class Q4 implements Cloneable {
    int a;
    static class Inner {
        Object copy(Q4 q) throws CloneNotSupportedException { return q.clone(); }
    }
}
