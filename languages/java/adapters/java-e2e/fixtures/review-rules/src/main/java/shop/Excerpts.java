package shop;

public final class Excerpts {
  private Excerpts() {}

  public static String shorten(String text, int max) {
    return text.length() > max ? text.substring(0, max - 3) + "..." : text; // violation: SurrogateSplittingCut
  }

  public static String safe(String text, int max) {
    if (text.length() > max) {
      int end = max;
      if (Character.isHighSurrogate(text.charAt(end - 1))) {
        end--;
      }
      return text.substring(0, end);
    }
    return text;
  }

  public static String checksum(String hash, int max) {
    return hash.length() > max ? hash.substring(0, max) : hash;
  }

  public static String initial(String text, int max) {
    return text.length() > max ? text.substring(0, 1) : text;
  }

  public static String normalize(String text) {
    if (text.length() > 63) {
      text = text.substring(0, 63);
    }
    return text;
  }

  public static String clean(String text, int max) {
    String letters = text.replaceAll("[^a-z0-9-]", "-");
    return letters.length() > max ? letters.substring(0, max) : letters;
  }

  public static String label(String normalized, int max) {
    return normalized.length() > max ? normalized.substring(0, max) : normalized;
  }

  public static String bindName(String name, int nameLimit) {
    return name.length() > nameLimit ? name.substring(0, nameLimit) : name;
  }
}
