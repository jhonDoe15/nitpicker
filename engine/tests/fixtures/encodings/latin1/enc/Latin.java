package enc;

class Latin {
    // café ñandú größe ¿qué? €Ÿ
    String first = "café ñandú"; String second = "größe ¿qué? €Ÿ" ; int one() { return 1; }
    void run() { String s = "café ñandúgröße ¿qué? €Ÿ"; System.out.println(s); }
    void loop() { /* größe ¿qué? €Ÿ */ try { run(); } catch (RuntimeException e) { } }
    boolean same(String x) { return "café ñandú" == x; }
    void tab() {	String t = "größe ¿qué? €Ÿ";	System.out.println(t + "café ñandú"); }
    char c = 'ÿ'; int y = (1 + 2); /** café ñandú @return nothing */ void doc() { }
}
