package p;
public class N8 implements Cloneable {
    public Object clone() throws CloneNotSupportedException {
        return this.clone(1);
    }
    Object clone(int x) throws CloneNotSupportedException { return super.clone(); }
}
