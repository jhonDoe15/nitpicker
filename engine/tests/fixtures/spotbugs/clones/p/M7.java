package p;
class M7 implements Cloneable {
    int a;
    @Override
    public M7 clone() {
        M7 copy = new M7();
        copy.a = a;
        return copy;
    }
}
