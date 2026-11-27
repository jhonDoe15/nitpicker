package pk;

import java.security.SecureRandom;
import java.util.*;

public class S {
    static int a() {
        SecureRandom random = new SecureRandom();
        return random.nextInt(5);
    }
    static int b() {
        SecureRandom random = new SecureRandom();
        List<Integer> l = new ArrayList<>();
        l.add(random.nextInt(5));
        return l.size();
    }
    static int c() {
        SecureRandom random = new SecureRandom();
        int x = random.nextInt(5);
        Collections.shuffle(new ArrayList<>(), random);
        return x;
    }
    static int d() {
        Random random = new Random();
        int x = random.nextInt(5);
        Collections.shuffle(new ArrayList<>(), random);
        return x;
    }
    static int e() {
        Random random = new Random();
        int x = random.nextInt(5);
        while (x < 3) {
            x += random.nextInt(5);
        }
        return x;
    }
    static String f() {
        String s = "abc";
        SecureRandom random = new SecureRandom();
        return "" + s.charAt(random.nextInt(s.length()));
    }
    static int g() {
        SecureRandom random = new SecureRandom();
        return random.nextInt(5) + random.nextInt(4);
    }
}
