package p;
public class Y extends X {
    @Override public X nul() { return this; }
    @Override public X onul() { return null; }
    @Override public void virt(X x) { }
}
