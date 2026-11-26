package p;
public class M4 extends Base implements Cloneable {
    int a;
    @Override
    public M4 clone() {
        M4 copy = new M4();
        copy.a = a;
        return copy;
    }
}
