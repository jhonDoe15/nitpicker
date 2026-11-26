package p;

import java.security.SecureRandom;
import java.util.Random;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.IntSupplier;

public class Randoms {
    private static final Random SHARED = new Random();
    private final Random seeded = new Random(42L);
    private final SecureRandom secure = new SecureRandom();

    int roll() {
        return new Random().nextInt(6);
    }

    int local() {
        return ThreadLocalRandom.current().nextInt(10);
    }

    double math() {
        return Math.random();
    }

    int safe() {
        return secure.nextInt();
    }

    IntSupplier later() {
        return () -> new java.util.Random().nextInt();
    }

    int fields() {
        return SHARED.nextInt() + seeded.nextInt();
    }

    static class Child extends Random {
        Child() {
            super(1L);
        }
    }

    static class Implicit extends Random {
        private static final long serialVersionUID = 1L;
    }

    static class Delegating extends Random {
        private static final long serialVersionUID = 1L;

        Delegating() {
            this(2L);
        }

        Delegating(long seed) {
            super(seed);
        }
    }

    Random anonymous() {
        return new Random() {
            private static final long serialVersionUID = 1L;
        };
    }

    @SuppressWarnings("serial")
    static class Quiet
            extends Random {
        Quiet(int unused) {
            nextInt();
        }
    }

    static class Grandchild extends Child {
        private static final long serialVersionUID = 1L;
    }

    @SuppressWarnings("serial")
    static
    class
    Spread extends Random {
    }
}
