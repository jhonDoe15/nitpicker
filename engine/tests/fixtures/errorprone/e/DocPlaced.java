/** Package doc in the wrong file. */
package e;

/** Import doc. */
import java.util.List;

/* A plain comment with @param x and </code>. */
/** First. */
/** Second. */
public class DocPlaced {
  /**/
  int empty;

  /** Doc. */ /* plain */ int afterPlain;

  /* @see Something */ /** Real doc. */ int both;

  /*
   * Almost javadoc with {@link List}.
   */
  public void almost() {}

  // /** line javadoc @return x */
  public void lineStart() {}

  // * @return value */
  public void lineStars() {}

  // */ @return x */
  public void lineSlash() {}

  /// Markdown @return x
  public void markdown() {}

  /* @codes is not a tag but matches. */
  int prefix;

  /* <b>bold</b> */
  int html;

  @Deprecated /** After annotation. */ public void afterAnnotation() {}

  public /** After modifier. */ void afterModifier() {}

  /** Before annotation. */ @Deprecated public void beforeAnnotation() {}

  void body() {
    /** Local variable. */
    int local = 1;
    /** Local class. */
    class Local {
      /** Local method. */
      void inner() {}
      /** Local field. */
      int field;
    }
    /* @param a local almost */
    int other = 2;
    Runnable r = new Runnable() {
      /** Anonymous method. */
      public void run() {}
    };
    /** Before statement. */
    local++;
  }

  /** Record. */
  record Pair(/** Component. */ int first, int second) {
    /** Compact. */
    Pair {}
  }

  enum Color {
    /** Red. */
    RED {
      /** Constant body method. */
      void paint() {}
      /* @return almost in constant body */
      void paint2() {}
    },
    /* @see almost constant */
    GREEN;
    /* @since almost enum method */
    void paint() {}
  }

  @SuppressWarnings("NotJavadoc")
  void suppressed() {
    /** Suppressed. */
    int a = 1;
  }

  @SuppressWarnings("AlmostJavadoc")
  /* @param suppressed almost */
  void suppressedAlmost(int x) {}

  /* @param x almost with javadoc */
  /** Javadoc. */
  void withDoc(int x) {}

  int[] array = {
    /** In initializer. */
    1
  };

  /** Dangling at end. */
}
/** After class. */
