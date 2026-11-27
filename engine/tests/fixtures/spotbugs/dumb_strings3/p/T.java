package p;

public class T {
    private String W = "abc";
    private String FC;
    private int Z;
    private int ZN = 7;
    private int ZW = 7;
    private static int SZ = 7;
    final int FI = 7;
    final int FIN;
    private int n;

    T() {
        FC = "abc";
        FIN = 7;
    }

    void set() {
        W = "abcdefghijklmnop";
        ZW = 1;
    }

    static String p(String s) {
        return s.substring(9);
    }

    String intern() {
        return "abc".intern().substring(9);
    }

    String strip() {
        return "abc".strip().substring(9);
    }

    String low() {
        return "abc".toLowerCase().substring(9);
    }

    String up() {
        return "abc".toUpperCase().substring(9);
    }

    String vo() {
        return String.valueOf("abc").substring(9);
    }

    String sub() {
        return "abcdef".substring(1).substring(9);
    }

    String trimc() {
        return "abc".trim().charAt(3) + "";
    }

    String fw() {
        return W.substring(9);
    }

    String fc() {
        return FC.substring(9);
    }

    String fz() {
        return "abc".substring(Z);
    }

    String fzn() {
        return "abc".substring(ZN);
    }

    String fzw() {
        return "abc".substring(ZW);
    }

    String fsz() {
        return "abc".substring(SZ);
    }

    String fi() {
        return "abc".substring(FI);
    }

    String fin() {
        return "abc".substring(FIN);
    }

    String param() {
        return p("abc");
    }

    String sw() {
        return "abc".substring(Integer.MAX_VALUE);
    }

    String lng() {
        long l = 9; return "abc".substring((int) l);
    }

    String chr() {
        return "abc".substring('a');
    }

    String sb2() {
        return new StringBuilder("abc").toString().substring(9);
    }

    String nul() {
        String t = null; return t.substring(-1);
    }

    String cond() {
        String t = n > 0 ? "a" : "b"; return t.substring(2);
    }

    String tb() {
        String t = """
            abc
            """; return t.substring(9);
    }

}

class Other2 {
    static String X = "abc";
    static int N = 7;
}
