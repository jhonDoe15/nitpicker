package p;

import java.util.Random;
import java.security.SecureRandom;

public class R {
    Random fld;
    SecureRandom sec;
    Object obj;
    static class MyRandom extends Random { }
    int a() {
        obj = new MyRandom();
        return fld.nextInt();
    }
    int b() {
        obj = new Random() { };
        return fld.nextInt();
    }
    void c() { new Random().notify(); }
    long d() { return new SecureRandom().ints().count(); }
    int e() {
        Random r = new Random();
        int a = r.nextInt();
        int b = r.nextInt(5);
        long c = r.nextLong();
        int d = r.nextInt(7);
        return a + b + (int) c + d;
    }
    int f() {
        obj = new Random();
        MyRandom m = new MyRandom();
        return m.nextInt();
    }
    int g() {
        obj = new Random();
        return sec.nextInt();
    }
    int h() {
        obj = new SecureRandom();
        return ((java.util.random.RandomGenerator) fld).nextInt();
    }
    int i() {
        Random r = new Random();
        Runnable x = () -> fld.nextInt();
        return 0;
    }
    int j() {
        Runnable x = () -> obj = new Random();
        return fld.nextInt();
    }
    int k() {
        Object o = new Random(fld.nextInt());
        return 0;
    }
    int l() {
        return new Random(fld.nextInt()).nextInt();
    }
}
