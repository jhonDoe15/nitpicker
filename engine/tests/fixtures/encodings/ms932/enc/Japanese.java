package enc;

class Japanese {
    // 日本語のテキスト ｱｲｳ ①②Ⅲ ～
    String first = "日本語のテキスト"; String second = "ｱｲｳ ①②Ⅲ ～" ; int one() { return 1; }
    void run() { String s = "日本語のテキストｱｲｳ ①②Ⅲ ～"; System.out.println(s); }
    void loop() { /* ｱｲｳ ①②Ⅲ ～ */ try { run(); } catch (RuntimeException e) { } }
    boolean same(String x) { return "日本語のテキスト" == x; }
    void tab() {	String t = "ｱｲｳ ①②Ⅲ ～";	System.out.println(t + "日本語のテキスト"); }
    char c = 'あ'; int y = (1 + 2); /** 日本語のテキスト @return nothing */ void doc() { }
}
