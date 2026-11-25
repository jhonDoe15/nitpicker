package e;
class Sup {
    static final String P = "PMD.";
    @SuppressWarnings("PMD." + "Field") int a;
    @SuppressWarnings(P + "Field") int b;
    int c;
}
