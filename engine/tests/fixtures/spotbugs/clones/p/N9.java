package p;
public class N9 implements Cloneable {
    int a;
    public N9 copy() { return this; }
    void use(N9 o) throws CloneNotSupportedException { Object x = o.clone(); }
}
