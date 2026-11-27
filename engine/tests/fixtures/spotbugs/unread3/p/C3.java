package p;

public class C3 {
    private int x;
    private int y;
    @Run private int a;
    void s() { a = 1; }
    @java.lang.annotation.Retention(java.lang.annotation.RetentionPolicy.RUNTIME) @interface Run {}
    C3() {
        x = 1;
        y = 2;
    }
}
