package fixtures.checkstyle;

/**
 * Holds documented members.
 */
public class Docs {
    /**
     * first sentence without period
     * @param value the value
     * @return the result
     */
    public int twice(int value) {
        return value * 2;
    }

    /**
     *
     */
    public void empty() {
    }

    /**
     * Has a paragraph.
     * <p>
     * Wrong paragraph.
     *
     * <p>Right paragraph.
     * @throws IllegalStateException never
     */
    public void para() {
    }

    /**
     * Returns the value.
     *
     * @return x
     * @param y unordered
     */
    public int ordered(int y) {
        return y;
    }

    /** Single line. */
    public void single() {
    }

    /**
     * Uses {@code tags} and @deprecated wrongly placed.
     *
     * @deprecated
     */
    @Deprecated
    public void old() {
    }

    /** @return missing summary */
    public int noSummary() {
        return 0;
    }

    public void undocumented(int a) {
    }
}
