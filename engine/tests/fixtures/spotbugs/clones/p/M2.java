package p;
public class M2 implements Cloneable {
    int a;
    @Override
    public M2 clone() {
        M2 copy = new M2();
        copy.a = Math.abs(a);
        return copy;
    }
}
