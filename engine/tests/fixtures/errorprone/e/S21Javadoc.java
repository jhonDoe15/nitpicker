import java.io.IOException;

/**
 * {@snippet file="foo.java"}
 */
interface S21SnippetFile {}

/**
 *
 * {@snippet :
 *    I have a colon
 *  }
 */
interface S21SnippetColon {}

/**
 * Summary.
 *
 * {@snippet
 *    I forgot the colon
 *  }
 */
interface S21SnippetNoColon {
  /**
   * Method.
   *
   * {@snippet
   *   no colon here either
   * }
   */
  void method();

  /**
   * Field.
   *
   * {@snippet
   *   field without colon
   * }
   */
  int FIELD = 1;
}

/**
 * Suppressed.
 *
 * {@snippet
 *   hidden
 * }
 */
@SuppressWarnings("InvalidSnippet")
interface S21SnippetSuppressed {}

interface S21ThrowsLink {
  /**
   * @throws {@link IOException} when failed
   * @throws {@code IllegalArgumentException} if a < 0
   */
  void foo(int a, int b) throws IOException;

  /**
   * @throws IOException when failed
   */
  void bar(int a, int b) throws IOException;

  /**
   * @throws {@link IOException
   */
  void baz();

  /**
   * @throws {@linkplain IOException} when failed
   */
  void qux();

  /**
   * @throws {@link
   *     IOException} when failed
   */
  void multiline();

  /**
   * @throws {@link IOException} suppressed
   */
  @SuppressWarnings("InvalidThrowsLink")
  void suppressed();
}

/**
 * // not a javadoc tag
 * <pre>{@code
 *  foo() {
 * }</pre>
 */
class S21UnrecognisedCode {}

/**
 *
 * <pre>{@code
 * foo() {}
 * }</pre>
 */
class S21UnrecognisedNegative {}

/**
 * {@link S21UnrecognisedNegative)
 */
class S21UnrecognisedLink {}

/** {@link S21UnrecognisedLink}, {@link Bar} */
class S21UnrecognisedCorrect {}

/** A {@code <pre>{@code ...}</pre>} block. */
class S21UnrecognisedNested {}

/** {@code foo}{@link bar) */
class S21UnrecognisedFollowing {}

/**
 * @deprecated use {@link S21UnrecognisedNested with {@link S21UnrecognisedNested}} instead.
 */
@Deprecated
class S21UnrecognisedNestedLink {}

class S21UnrecognisedMembers {
  /** The {@code foo field. */
  int field;

  /** The {@link foo method. */
  void method() {}

  /** {@linkplain S21UnrecognisedMembers} and {@code ok} and {@link S21UnrecognisedMembers#method( */
  void other() {}
}

/**
 * @see https://foo for more details
 */
class S21UrlInSee {
  /**
   * Method.
   *
   * @see http://example.com/some/page
   * @see java.util.List
   */
  void method() {}

  /** @see https://foo field */
  int field;

  /**
   * @see https://suppressed
   */
  @SuppressWarnings("UrlInSee")
  void suppressed() {}
}

/**
 * @see java.util.List
 */
class S21UrlInSeeNegative {}

class S21InheritDoc {
  /** {@inheritDoc} */
  void test() {}

  /** {@inheritDoc} */
  @Override
  public boolean equals(Object o) {
    return true;
  }

  /** Summary. {@inheritDoc} and again {@inheritDoc} */
  @Override
  public int hashCode() {
    return 1;
  }

  /** {@inheritDoc} */
  private static final int A = 1;

  /** {@inheritDoc} */
  S21InheritDoc() {}

  /** {@inheritDoc} */
  static void staticMethod() {}

  /** {@inheritDoc} */
  @SuppressWarnings("InheritDoc")
  void suppressed() {}

  /** {@inheritDoc} */
  enum Plain { ONE, /** {@inheritDoc} */ TWO }

  /** {@inheritDoc} */
  interface Empty {}

  /** {@inheritDoc} */
  interface Sub extends Empty {}

  /** {@inheritDoc} */
  record Rec() {}

  /** {@inheritDoc} */
  record RecImpl() implements Empty {}
}

/** {@inheritDoc} */
class S21InheritDocClass {}

/** {@inheritDoc} */
class S21InheritDocSub extends java.util.ArrayList<String> {
  /** {@inheritDoc} */
  @Override
  public boolean add(String s) {
    return true;
  }
}
