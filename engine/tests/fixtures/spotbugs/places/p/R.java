package p;

import java.util.Random;

public class R {
    private final Random a = new Random();
    private static final Random B = new Random();
    static {
        System.out.println(new Random().nextInt());
    }
    public R() {}
    public R(int x) {}
    public R(String s) { this(1); }
    Runnable r = () -> System.out.println(Math.random());
}
