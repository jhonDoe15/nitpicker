package e;

class F27Literals {
    long octal = 0_1__2l;
    long hex = 0x1__2l;
    long binary = 0b1__0l;
    int decimal = 1__000;
    double fraction = 1__0.2__5;
    long plain = 1_000l;

    void run() {
        try {
            run();
        } catch (RuntimeException e) {
        }
    }
}
