package p;

public class C {
    static final String K = "abcd";
    private String f = "xy";

    String strings(String s, int n) {
        String a = "abc".substring(3);
        String b = "abc".substring(4);
        String c = "abc".substring(1, 4);
        String d = "abc".substring(2, 1);
        String e = "abc".substring(-1, 2);
        char g = "abc".charAt(3);
        char h = K.charAt(4);
        char i = s.charAt(-2);
        String j = s.substring(0, -1);
        String k = s.substring(3, 2);
        String l = f.substring(5);
        int m = "abc".codePointAt(5);
        String o = "abc".subSequence(0, 7).toString();
        String q = "abc".substring(n, 5);
        String r = "abc".substring(5, n);
        StringBuilder sb = new StringBuilder("abc");
        char t = sb.charAt(-1);
        String u = sb.substring(-1);
        String v = "".substring(1);
        char w = "abc".charAt(-1);
        String x = s.substring(-1, -2);
        return a + b + c + d + e + g + h + i + j + k + l + m + o + q + r + t + u + v + w + x;
    }

    String local() {
        String s = "ab";
        return s.substring(3);
    }

    String concat() {
        return ("ab" + "cd").substring(5);
    }
}
