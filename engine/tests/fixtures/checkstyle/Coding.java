package fixtures.checkstyle;

public class Coding {
    private int total;

    public Coding() {
    }

    void run(int a) {
    }

    public Coding(int start) {
        total = start;
    }

    void stop() {
    }

    void run(String a) {
    }

    int distance() {
        int far = 1;
        total++;
        total--;
        total += 2;
        total -= 3;
        return far;
    }

    void init() {
        StringBuilder builder = new StringBuilder();
        builder.append(1);
        builder.append(2);
        builder.append(3);
        builder.append(4);
        String text = builder.toString();
        total += text.length();
    }

    void caught() {
        try {
            total++;
        } catch (RuntimeException e) {
        }
        try {
            total++;
        } catch (IllegalStateException e) {
            // ignored on purpose
        }
        try {
            total++;
        } catch (IllegalArgumentException e) {
            // ....
        }
    }

    int falls(int key) {
        switch (key) {
            case 1:
                total++;
            case 2:
                total--;
                // fall through
            case 3:
                total += 3;
                break;
            case 4:
                if (key > 0) {
                    return 1;
                } else {
                    total++;
                }
            default:
                total = 0;
        }
        return total;
    }

    void lines() {
        total++; total--;
        int x = 1; int y = 2;
        Runnable r = () -> { total++; total--; };
        total += x + y;
        r.run();
    }
}
