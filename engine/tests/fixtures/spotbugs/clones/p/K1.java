package p;
public class K1 implements Cloneable {
    int a;
    @Override
    public K1 clone() {
        K1 copy = new K1();
        copy.a = a;
        return copy;
    }
}
