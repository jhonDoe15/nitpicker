package e;

public class TestOnlyAsserts {
    TestOnlyAsserts(int x) {
        assert x > 0;
    }

    record R(int y) {
        R {
            assert y > 0 : "positive";
        }
    }

    void m(int x) {
        assert x > 0;
    }

    static {
        assert true;
    }
}
