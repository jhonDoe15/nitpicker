package e;

class F27EmptyCatch {
    void run() {}

    void onlySemicolon() {
        try {
            run();
        } catch (RuntimeException e) {
            ;
        }
    }

    void empty() {
        try {
            run();
        } catch (RuntimeException e) {
        }
    }
}
