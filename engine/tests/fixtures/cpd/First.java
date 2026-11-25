package fixture;

import java.util.List;

public class First {
    First(int x) { this(); }
    First() { super(); }
    public int sum(java.util.List<Integer> values, int limit) {
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
    public int sum2(java.util.List<Integer> values, int limit) {
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
    class Inner {
        Inner() { }
        public int sum3(java.util.List<Integer> values, int limit) {
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
    }
}
