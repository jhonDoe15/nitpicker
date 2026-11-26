package p;
public class Q6 implements Cloneable {
    int a;
    public Q6 clone() {
        Runnable r = () -> { };
        return new Q6();
    }
    public static Q6 make() throws CloneNotSupportedException { return (Q6) new Q6().clone(); }
}
