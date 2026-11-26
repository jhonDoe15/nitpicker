package p;
public class K12 implements Cloneable {
    int a;
    public K12 copy() throws CloneNotSupportedException { return (K12) clone(); }
}
