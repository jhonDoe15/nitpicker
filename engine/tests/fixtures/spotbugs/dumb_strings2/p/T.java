package p;

public class T {
    static final String SF = "abcd";
    final String F = "abc";
    private String NF = "abc";
    private String s;
    private int n;

    String sub1() {
        return "abc".substring(4);
    }

    String sub1ok() {
        return "abc".substring(3);
    }

    String sub2() {
        return "abc".substring(0, 4);
    }

    String sub2b() {
        return "abc".substring(4, 4);
    }

    String sub2c() {
        return "abc".substring(5, 2);
    }

    String sub2d() {
        return "abc".substring(2, 1);
    }

    String sub2e() {
        return s.substring(5, 4);
    }

    String sub2f() {
        return s.substring(-1, n);
    }

    String sub2g() {
        return s.substring(n, -1);
    }

    String sub2h() {
        return "abc".substring(n, 4);
    }

    String sub2i() {
        return "abc".substring(4, n);
    }

    String sub2j() {
        return "abc".substring(-1, n);
    }

    String ch() {
        return "abc".charAt(3) + "";
    }

    String chs() {
        return s.charAt(-1) + "";
    }

    String cpb() {
        return "abc".codePointBefore(4) + "";
    }

    String cpb0() {
        return "abc".codePointBefore(0) + "";
    }

    String cpc() {
        return "abc".codePointCount(0, 4) + "";
    }

    String obc() {
        return "abc".offsetByCodePoints(4, 0) + "";
    }

    String gc() {
        "abc".getChars(0, 4, new char[9], 0); return "";
    }

    String sseq() {
        return "abc".subSequence(4, 4).toString();
    }

    String idx() {
        return "abc".indexOf('a', 9) + "";
    }

    String sw() {
        return "abc".startsWith("a", 9) + "";
    }

    String rm() {
        return "abc".regionMatches(9, "a", 0, 1) + "";
    }

    String cp() {
        return "abc".codePointAt(3) + "";
    }

    String cps() {
        return s.codePointAt(-1) + "";
    }

    String sbch() {
        return new StringBuilder("abc").charAt(9) + "";
    }

    String sbsub() {
        return new StringBuilder("abc").substring(9);
    }

    String sbdel() {
        return new StringBuilder("abc").deleteCharAt(-1).toString();
    }

    String cs() {
        CharSequence c = "abc"; return c.charAt(9) + "";
    }

    String fin() {
        return F.substring(4);
    }

    String nf() {
        return NF.substring(4);
    }

    String sfin() {
        return SF.substring(5);
    }

    String loc() {
        String t = "abc"; return t.substring(4);
    }

    String loc2() {
        String t = "abc"; if (n > 0) { t = "abcdefgh"; } return t.substring(4);
    }

    String empty() {
        return "".charAt(0) + "";
    }

    String emptys() {
        return "".substring(0);
    }

    String uni() {
        return "\u00e9".substring(2);
    }

    String sup() {
        return "\ud83d\ude00".substring(3);
    }

    String concat() {
        return (s + "abc").substring(9);
    }

    String tostr() {
        return "abc".toString().substring(9);
    }

    String trim() {
        return "abc".trim().substring(9);
    }

    String neg() {
        return s.substring(-1);
    }

    String negc() {
        int i = -1; return s.substring(i);
    }

    String big() {
        return s.substring(1000000);
    }

    String repl() {
        return "abc".replace('a', 'b').substring(9);
    }

    String textb() {
        return "ab".concat("c").substring(9);
    }

}
