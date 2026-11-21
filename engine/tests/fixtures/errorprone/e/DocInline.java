package e;

import java.util.List;

/**
 * Uses {@code &amp;} and {@literal &#64;} and {@code &x1F;} and {@code a & b}.
 * Also {@List} and {@Foo} and {@link List} and {@linkplain List}, {@linK List}, {@lnk List}.
 * Then {@index term} and {@summary sum} and {@systemProperty a.b} and {@return x} and {@if x} and {@T}.
 * See @link{List} or (@link List) or (@code x (y)) and @param foo and {@a.b.c.d}.
 *
 * @param <T> the type {@since 1} and {@author me} and {@inheritDoc}
 */
public class DocInline<T> {
  /** A field {@inheritDoc} with {@value} and @value{x} and (@inheritDoc) and {@param x} and {@throws X}. */
  public static final int FIELD = 1;

  /**
   * Method {@param first} and {@param  first} and {@first} and {@param other} and {@second x}.
   *
   * @param first uses @param first inline and {@code @param first}
   * @param second {@return yes} {@summary no} {@index a b}
   * @return {@exception x} and {@serialData y} and {@valu z} and {@codes q}
   */
  public int method(int first, int second) {
    return first + second;
  }

  /** Unterminated {@param first */
  public void broken(int first) {}

  /** An {@List.of} and {@java.util.List} and {@String} and {@Strin}. */
  public void types() {}

  /**
   * Inner.
   *
   * @see List {@index x}
   */
  @SuppressWarnings("InvalidInlineTag")
  public void suppressed() {
    /** A local {@code &lt;} {@unknownLocal}. */
    int local = 1;
  }

  /** {@code &lt;} */
  @SuppressWarnings("EscapedEntity")
  public void suppressedEntity() {}

  /** Record {@first}. */
  record Pair(int first, int second) {
    /** Compact {@first} and {@param second}. */
    Pair {}
  }

  enum Color {
    /** Red {@inheritDoc} {@code &amp;}. */
    RED
  }

  /**
   * <a href="x {@code &amp;} (@link y)">z</a> and {@link List label (@code inner)} and {@snippet : &amp; (@link x) }
   */
  interface Shape {
    /** {@inheritDoc} {@docRoot} {@value #FIELD} {@code x} @code{y}. */
    void draw();
  }
}
