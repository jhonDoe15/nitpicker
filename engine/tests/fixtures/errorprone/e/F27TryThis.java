package e;

class F27TryThis implements AutoCloseable {
    @Override
    public void close() {}

    void self() throws Exception {
        try (F27TryThis c = this) {
            c.close();
        }
    }

    void other(F27TryThis d) throws Exception {
        try (F27TryThis c = d) {
            c.close();
        }
    }
}
