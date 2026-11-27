package enc;

class Windows {
    // €uro “quoted” šŸ–ž ‰
    String first = "€uro “quoted”"; String second = "šŸ–ž ‰" ; int one() { return 1; }
    void run() { String s = "€uro “quoted”šŸ–ž ‰"; System.out.println(s); }
    void loop() { /* šŸ–ž ‰ */ try { run(); } catch (RuntimeException e) { } }
    boolean same(String x) { return "€uro “quoted”" == x; }
    void tab() {	String t = "šŸ–ž ‰";	System.out.println(t + "€uro “quoted”"); }
    char c = '€'; int y = (1 + 2); /** €uro “quoted” @return nothing */ void doc() { }
}
