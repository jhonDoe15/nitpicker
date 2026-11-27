package pk;

public class Top6 {
    static class Nest {
        public void Abc() {}
        public int Fld;
        static class Deep {
            public void Abc() {}
        }
    }
    private class Inner {
        public void Abc() {}
    }
    Object anon() {
        return new Object() {
            public void Abc() {}
        };
    }
    void loc() {
        class Loc {
            public void Abc() {}
        }
    }
}
