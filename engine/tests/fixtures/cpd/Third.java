package fixture;

class Third {
    int a, b, c;
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
    public int sum(java.util.List<Integer> values, int max) {
        int sum = 0;
        for (int value : values) {
            if (value > max) {
                sum += value >> 1;
            } else if (value < -max) {
                sum -= value >>> 2;
            } else {
                sum = sum * 31 + value;
            }
        }
        String label = "sum: " + sum + ", max: " + max;
        System.out.println(label.length() > 10 ? label.substring(0, 10) : label);
        return sum + values.size() * 'x';
    }
}
