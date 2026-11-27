public class S38Pmi33 {

  int test_switch() {
    Object o = 1;
    if (o instanceof Integer) {
      // Next line will be turned into "return switch i {".
      return switch ((Integer) o) {
        case 0 -> 0;
        default -> 1;
      };
    }
    return 0;
  }

  boolean test_if() {
    Object o = false;
    if (o instanceof Boolean) {
      // Next line will be turned into "if b {".
      if ((Boolean) o) {
        return (Boolean) o;
      }
    }
    return false;
  }
}
