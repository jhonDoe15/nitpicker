package p;

public class C11 {
    private int x;
    private int y;
    @Cls private int a;
    void s() { a = 1; }
    @java.lang.annotation.Retention(java.lang.annotation.RetentionPolicy.CLASS) @interface Cls {}
    C11() {
        x = 1;
        y = 2;
    }
}
