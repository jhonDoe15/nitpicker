package c;

import org.junit.Test;

public class NewTest {
    @Test
    public void works() {}

    public void forgotten() {}

    @Deprecated
    public void annotated() {}

    private void helper() {}

    public static void shared() {}

    public int counted() {
        return 1;
    }
}
