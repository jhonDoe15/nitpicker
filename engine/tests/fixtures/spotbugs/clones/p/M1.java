package p;
public class M1 implements Cloneable {
    @Override
    public M1 clone() {
        M1 x = new M1();
        return x;
    }
}
