package pk;

import java.util.*;

public class T extends Base {
    Random fld = new Random(3);
    private int priv() { return 1; }
    private static int spriv() { return 1; }
    int a() {
        Random r = new Random();
        Object o = new Object();
        return r.nextInt();
    }
    int b() {
        Random r = new Random();
        int p = priv();
        return r.nextInt() + p;
    }
    int c() {
        Random r = new Random();
        int p = super.base();
        return r.nextInt() + p;
    }
    int d() {
        Random r = new Random();
        Object o = new Object();
        Random s = new Random();
        return r.nextInt();
    }
    int e() {
        Random r = new Random();
        Runnable q = () -> {};
        return r.nextInt();
    }
    int f(String x) {
        Random r = new Random();
        String y = x + r;
        return r.nextInt();
    }
    int g() {
        Random r = new Random();
        int[] arr = new int[3];
        return r.nextInt();
    }
    int h() {
        Random r = new Random();
        int p = spriv();
        return r.nextInt() + p;
    }
    int i() {
        Random r = new Random();
        StringBuilder sb = new StringBuilder();
        int x = r.nextInt();
        int y = r.nextInt(3);
        return x + y;
    }
    int j() {
        Random r = new Random();
        int x = r.nextInt();
        Object o = new Object();
        int y = r.nextInt(3);
        return x + y;
    }
    int k() {
        Random r = new Random();
        Object o = new Object() { };
        return r.nextInt();
    }
    int l() {
        Random r = new Random();
        Integer z = Integer.valueOf(3);
        return r.nextInt();
    }
}
