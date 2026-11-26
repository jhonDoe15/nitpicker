package d;

import java.math.BigDecimal;
import java.math.BigInteger;

public class Strings {
    private static final String ONE = "1";
    private static final String TEN = ONE + "0";
    private final String instanceOne = "1";
    private String joined = "";

    BigInteger numbers(String text) {
        BigInteger a = new BigInteger("0");
        BigInteger b = new BigInteger(TEN);
        BigInteger c = new BigInteger(instanceOne);
        BigDecimal d = new BigDecimal(1);
        BigDecimal e = new BigDecimal(1.0);
        BigDecimal f = new BigDecimal("2");
        return a.add(b).add(c).add(d.toBigInteger()).add(e.toBigInteger()).add(f.toBigInteger());
    }

    boolean empties(String text) {
        boolean one = text.trim().length() == 0;
        boolean two = text.trim().isEmpty();
        boolean three = 0 != text.trim().length();
        boolean four = text.length() == 0;
        return one || two || three || four;
    }

    String buffers(String name, int count) {
        StringBuilder builder = new StringBuilder("a" + name);
        builder.append("b" + count);
        builder.append("c" + "d");
        builder.append(name);
        builder.append(count);
        StringBuffer other = new StringBuffer();
        other.append(name).append(count);
        other.append(1);
        StringBuilder started = new StringBuilder().append(name);
        started.append(count);
        return builder.toString() + other + started;
    }

    String appends(String[] parts) {
        String all = "";
        for (String part : parts) {
            all += part;
        }
        String twice = "x";
        twice = twice + parts[0];
        twice += parts[1];
        for (int i = 0; i < parts.length; i++) {
            joined += parts[i];
        }
        return all + twice;
    }

    boolean literals(String text, Object other) {
        boolean a = text.equals("x");
        boolean b = "x".equals(text);
        boolean c = text.equalsIgnoreCase(ONE);
        boolean d = text.compareTo(instanceOne) == 0;
        boolean e = text.contentEquals("x" + 1);
        boolean f = other.equals("y");
        return a || b || c || d || e || f;
    }

    String escapes() {
        String a = "\128";
        String b = "\0009";
        String c = "\49";
        String d = "\\128";
        return a + b + c + d;
    }

    String repeated() {
        String a = "repeated literal";
        String b = "repeated literal";
        String c = "repeated literal";
        String e = "repeated literal";
        String f = "it's \"quoted\"\t";
        String g = "it's \"quoted\"\t";
        String h = "it's \"quoted\"\t";
        String i = "it's \"quoted\"\t";
        return a + b + c + e + f + g + h + i;
    }
}
