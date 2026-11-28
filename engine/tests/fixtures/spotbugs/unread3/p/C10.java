package p;

public class C10 {
    private int x;
    private int y;
    @Src private int a;
    void s() { a = 1; }
    @java.lang.annotation.Retention(java.lang.annotation.RetentionPolicy.SOURCE) @interface Src {}
    C10() {
        x = 1;
        y = 2;
    }
}
