package shop;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class ArithmeticTest {
    @Test
    void addsTwoNumbers() {
        assertEquals(4, Math.addExact(2, 2));
    }
}
