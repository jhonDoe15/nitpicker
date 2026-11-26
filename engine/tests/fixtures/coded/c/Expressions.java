package c;

import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class Expressions {
    private static int counter;
    private static final int LIMIT = 017;
    private int value;
    private int octal = 010;
    private long smallOctal = 07L;
    private double notOctal = 010.5;

    public Expressions(int value) {
        counter = value;
        Expressions.counter++;
        this.value = value;
        value = value;
        this.value = this.value;
    }

    void skip(InputStream in) throws IOException {
        in.skip(10);
        long skipped = in.skip(10);
        if (skipped < 10) {
            in.skip(1L);
        }
    }

    boolean cases(String a, String b) {
        boolean one = a.toLowerCase().equals(b);
        boolean two = a.equalsIgnoreCase(b.toUpperCase());
        boolean three = a.equals(b.trim());
        return one && two && three;
    }

    void immutables(String text, BigDecimal amount, LocalDate day) {
        text.trim();
        text.getChars(0, 1, new char[1], 0);
        amount.add(BigDecimal.ONE);
        day.plusDays(1);
        text.length();
    }

    void collections(List<String> list, Map<String, String> map, Set<Thread.State> states) {
        if (list.size() == 0 || map.size() != 0 || list.size() > 0 || 1 > list.size() || list.size() >= 1) {
            return;
        }
        Map<Thread.State, String> byState = new HashMap<Thread.State, String>();
        Set<Thread.State> stateSet = new HashSet<>(states);
        Set<String> names = new HashSet<String>();
        List<String> copy = new ArrayList<>(list);
        byState.put(Thread.State.NEW, names.toString() + copy + stateSet);
    }

    String strings(String text, char[] chars, StringBuilder builder) {
        String made = new String("x");
        String copy = new String(text);
        String fromChars = new String(chars);
        String empty = new String();
        int at = text.indexOf("a") + text.lastIndexOf("b", 3) + text.indexOf("ab");
        String joined = "" + at + text + "";
        final String blank = "";
        String later = blank + text;
        builder.append("a").append('b').append("cd");
        String valued = String.valueOf(text) + "x" + String.valueOf(at) + String.valueOf(chars);
        String both = String.valueOf(at) + String.valueOf(at);
        String astral = "\ud842\udfb7" + text;
        return made + copy + fromChars + empty + joined + later + valued + both + astral;
    }
}
