package s27pi;

class First {
    void run() {
        try {
            run();
        } catch (RuntimeException e) {
        }
    }
}

class Second {}
