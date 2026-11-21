package e;

public class DocTags {
    /**
     * Counts the names.
     *
     * @return never on a field
     */
    int afterText;

    /**
     * @param escaped an escaped at sign starts a tag
     */
    int escaped;

    /** Holds a value, {@return as an inline tag}. */
    int inline;

    /**
     * Holds a value.
     *
     * @deprecated since {@return nested in a tag}
     */
    int nested;

    /**
     * @throws IllegalStateException first in the comment
     */
    int first;
}
