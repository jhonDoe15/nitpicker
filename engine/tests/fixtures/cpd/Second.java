package fixture;

public class Second {
    int a, b, c;
    public int sum(java.util.List<Integer> values, int limit) {
        int total = 0;
        for (int value : values) {
            if (value > limit) {
                total += value >> 1;
            } else if (value < -limit) {
                total -= value >>> 2;
            } else {
                total = total * 37 + value;
            }
        }
        String label = "total: " + total + ", limit: " + limit;
        System.out.println(label.length() > 10 ? label.substring(0, 10) : label);
        return total + values.size() * 'x';
    }
    void step0() {
        a = b + c; b = c + a; c = a + b; a = b + c; b = c + a; c = a + b;
        a = b + c; b = c + a; c = a + b; a = b + c; b = c + a; c = a + b;
    }
    void step1() {
        a = b + c; b = c + a; c = a + b; a = b + c; b = c + a; c = a + b;
        a = b + c; b = c + a; c = a + b; a = b + c; b = c + a; c = a + b;
    }
    void step2() {
        a = b + c; b = c + a; c = a + b; a = b + c; b = c + a; c = a + b;
        a = b + c; b = c + a; c = a + b; a = b + c; b = c + a; c = a + b;
    }
    void step3() {
        a = b + c; b = c + a; c = a + b; a = b + c; b = c + a; c = a + b;
        a = b + c; b = c + a; c = a + b; a = b + c; b = c + a; c = a + b;
    }
    // CPD-OFF
    public int hidden(java.util.List<Integer> values, int limit) {
        int total = 0;
        for (int value : values) {
            if (value > limit) {
                total += value >> 1;
            } else if (value < -limit) {
                total -= value >>> 2;
            } else {
                total = total * 31 + value;
            }
        }
        String label = "total: " + total + ", limit: " + limit;
        System.out.println(label.length() > 10 ? label.substring(0, 10) : label);
        return total + values.size() * 'x';
    }
    // CPD-ON
    @SuppressWarnings("CPD-START")
    public int alsoHidden(java.util.List<Integer> values, int limit) {
        int total = 0;
        for (int value : values) {
            if (value > limit) {
                total += value >> 1;
            } else if (value < -limit) {
                total -= value >>> 2;
            } else {
                total = total * 31 + value;
            }
        }
        String label = "total: " + total + ", limit: " + limit;
        System.out.println(label.length() > 10 ? label.substring(0, 10) : label);
        return total + values.size() * 'x';
    }
    @SuppressWarnings("CPD-END")
    void after() { }
    enum Kind { ONE, TWO; Kind() { } }
}
