package p;
public class M8 implements Cloneable {
    private M8() {}
    int a;
    @Override
    public M8 clone() {
        M8 copy = new M8();
        copy.a = a;
        return copy;
    }
}
