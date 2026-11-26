package p;
public class K10 implements Cloneable {
    public Object clone() {
        try {
            return helper();
        } catch (CloneNotSupportedException e) {
            return null;
        }
    }
    Object helper() throws CloneNotSupportedException {
        return super.clone();
    }
}
