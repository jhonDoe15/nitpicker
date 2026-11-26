package e;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.sql.SQLException;

public class B4InvalidThrows {
  /**
   * Summary.
   *
   * @throws IOException if broken
   */
  void a() {}

  /**
   * Summary.
   *
   * @throws IOException if broken
   */
  void b() throws IOException {}

  /**
   * Summary.
   *
   * @throws FileNotFoundException if missing
   */
  void c() throws IOException {}

  /**
   * Summary.
   *
   * @throws IOException if broken
   */
  void d() throws FileNotFoundException {}

  /**
   * Summary.
   *
   * @throws IllegalStateException if bad
   * @throws Error if worse
   */
  void e() {}

  /**
   * Summary.
   *
   * @exception SQLException if sql
   * @throws java.io.IOException qualified
   * @throws Unknown not resolvable
   * @throws Exception generic
   * @throws Throwable top
   */
  void f() {}

  /**
   * Summary.
   *
   * @param <T> a type
   * @throws T a type variable
   */
  <T extends Exception> void g() {}

  /**
   * Summary.
   *
   * @throws IOException if broken
   *     over lines
   * @return nothing
   */
  int h() {
    return 0;
  }

  /** @throws IOException short */
  B4InvalidThrows() {}

  /**
   * Summary.
   *
   * @throws IOException if broken
   */
  @SuppressWarnings("InvalidThrows")
  void s() {}

  /**
   * Summary.
   *
   * @throws IOException if broken
   */
  int field;
}
