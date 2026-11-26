package e;

import java.io.IOException;

/**
 * A class with @{code broken} tag and @{link B6Docs} and @{literal x}.
 *
 * @exception IllegalStateException on class level is not flagged
 */
class B6Docs {
  /** Field with @{code field} text. */
  int field;

  /** Several @{code one} and @{code two} in a row, and @{link #field}. */
  void several() {}

  /**
   * Multi
   * line @{code split}
   * and @{value #field} and @{inheritDoc} too.
   *
   * @param x the @{code x} param
   * @return @{code y}
   */
  int multi(int x) {
    return x;
  }

  /**
   * Throws stuff.
   *
   * @exception IOException if reading fails
   * @throws IllegalStateException fine
   * @exception IllegalArgumentException again
   */
  void throwing() throws IOException {}

  /** @exception RuntimeException inline */
  void inline() {}

  /**
   * Unknown tags like @{foo} and @{ code} are fine, so is @ {code}.
   */
  void unknown() {}

  /**
   * Everything: @{code a} @{docRoot} @{index b} @{link c} @{linkplain d} @{literal e} @{summary f}
   * @{systemProperty g} @{value h} @{snippet i} @{return j} @{inheritDoc}.
   */
  void everything() {}

  // @{code in a line comment}
  void lineComment() {}

  /* @{code in a block comment} */
  void blockComment() {}

  /**
   * Tabbed	@{code tab}
   *
   * @exception	Exception tabbed
   */
  void tabbed() throws Exception {}

  /**
   * The value is @{code ok}.
   * @exception IOException after text
   */
  B6Docs() throws IOException {}

  /** Enum with @{code x}. */
  enum E {
    /** Constant with @{code y}. */
    A;

    /**
     * @exception Exception thrown
     */
    void m() throws Exception {}
  }

  /** Suppressed @{code z} */
  @SuppressWarnings("MalformedInlineTag")
  void suppressed() {}

  /**
   * @exception Exception thrown
   */
  @SuppressWarnings("PreferThrowsTag")
  void suppressedThrows() throws Exception {}

  /**
   * Unicode ünï @{code é} and 日本 @{link x}.
   */
  void unicode() {}

  interface I {
    /**
     * @exception RuntimeException from interface @{code}
     */
    void m();
  }

  /**
   * @{codeblah}
   * @{code
   * @{linkplain
   */
  void partial() {}

  /**
   * @exception
   */
  void bare() {}
}
