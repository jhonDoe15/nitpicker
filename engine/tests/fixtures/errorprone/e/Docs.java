package e;

import java.util.List;

/** Doc comments that the doc checks read. */
public class Docs {
    /**
     * Adds one.
     *
     * @param value
     * @return
     */
    public int emptyTags(int value) {
        return value + 1;
    }

    /** @return the value plus two */
    public int missingSummary(int value) {
        return value + 2;
    }

    /**
     * @param value what to add to
     * @see Docs
     */
    public int onlyTags(int value) {
        return value + 3;
    }

    /**
     * Adds four.
     *
     * @returns the value plus four
     * @value the value
     * @parm value what to add to
     */
    public int invalidTags(int value) {
        return value + 4;
    }

    /** Gives a List<String> of names, or a Map<String, Integer> when a < b. */
    public List<String> entity() {
        return null;
    }

    /** Gives a {@code List<String>} of names. */
    public List<String> escaped() {
        return null;
    }
}
