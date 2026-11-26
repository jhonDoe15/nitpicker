package p;
public class M6 implements Cloneable {
    int a;
    @Override
    protected Object clone() {
        M6 copy = new M6();
        copy.a = a;
        return copy;
    }
}
