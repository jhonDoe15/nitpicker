import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

/**
 * Differential cases for the engine's model of java.util.regex.Pattern (engine/src/java/errorprone/regex).
 *
 * <ul>
 *   <li>{@code gen <seed> <count> [tokens]}: random patterns and flags, one per line.
 *   <li>{@code check}: reads pattern and flags lines and writes them with the message Pattern.compile throws on this JDK,
 *       the format of tests/expected/regex-cases-*.tsv.
 *   <li>{@code properties}: the property names \p{...} accepts on this JDK, as kind and name (names/properties.tsv).
 *       Needs {@code --add-opens java.base/java.lang=ALL-UNNAMED}.
 * </ul>
 */
public class RegexProbe {
  private static final Pattern CANONICAL_FLAG = Pattern.compile("\\(\\?[a-zA-Z-]*c");

  private static final Pattern CHARACTER_NAME =
      Pattern.compile("\\\\N\\{[\\x00-\\x20]*[A-Za-z0-9-]+( [A-Za-z0-9-]+)*[\\x00-\\x20]*\\}");

  private static final String[] TOKENS = {"a", "b", "z", "1", "0", "9", "(", ")", "[", "]", "{", "}", "|", "*", "+",
      "?", "^", "$", ".", "-", "&", "&&", ",", "#", " ", "\n", "<", ">", "=", "!", ":", "\\", "\\\\", "\\d", "\\w",
      "\\b", "\\B", "\\p{L}", "\\p{", "\\pL", "\\p", "\\x{", "\\x", "\\u", "\\u0061", "\\0", "\\07", "\\c", "\\k<a>",
      "\\k", "\\1", "\\2", "\\Q", "\\E", "\\N{", "\\N", "\\R", "\\X", "\\b{g}", "\\t", "\\.", "\\[", "\\]", "\\-", "(?",
      "(?<", "(?<=", "(?<!", "(?:", "(?=", "(?!", "(?>", "(?<a>", "(?<b>", "(?i)", "(?x)", "(?-x)", "(?x:", "(?u",
      "(?d)", "(?s-", "{1}", "{2,}", "{1,2}", "{0,1}", "{3,1}", "{2147483647}", "{2147483648}", "{,", "{1,", "é",
      "😀", "\u0000", "\u0085", "\r", "\t", "[^", "[a-", "-z]", "a-z", "\\p{Is", "Latin}", "\\p{In", "Greek}",
      "\\p{sc=", "\\p{gc=", "Lu}", "\\x{10FFFF}", "\\x{110000}", "61", "ff", "F", "g", "A", "Z", "k", "p", "x", "u", "N"};

  private static final int[] FLAGS = {1, 2, 8, 32, 64, 256, 5, 128, 16, 66, 70, 6, 322, 68};

  static String escape(String text) {
    StringBuilder out = new StringBuilder();
    for (char c : text.toCharArray()) {
      if (c == '\\') {
        out.append("\\\\");
      } else if (c == '\n') {
        out.append("\\n");
      } else if (c == '\t') {
        out.append("\\t");
      } else if (c < 32 || c > 126) {
        out.append(String.format("\\u%04x", (int) c));
      } else {
        out.append(c);
      }
    }
    return out.toString();
  }

  static String unescape(String text) {
    StringBuilder out = new StringBuilder();
    for (int at = 0; at < text.length(); at++) {
      char c = text.charAt(at);
      if (c != '\\') {
        out.append(c);
        continue;
      }
      char next = text.charAt(++at);
      if (next == 'n') {
        out.append('\n');
      } else if (next == 't') {
        out.append('\t');
      } else if (next == 'u') {
        out.append((char) Integer.parseInt(text.substring(at + 1, at + 5), 16));
        at += 4;
      } else {
        out.append(next);
      }
    }
    return out.toString();
  }

  static String compile(String pattern, int flags) {
    boolean canonical = (flags & Pattern.CANON_EQ) != 0 || CANONICAL_FLAG.matcher(pattern).find();
    boolean behind = pattern.contains("(?<=") || pattern.contains("(?<!");
    if (canonical && (behind || (flags & Pattern.CANON_EQ) != 0 && !pattern.chars().allMatch(c -> c < 128))) {
      return "skip: canonical equivalence";
    }
    if (CHARACTER_NAME.matcher(pattern).find()) {
      return "skip: character name";
    }
    try {
      Pattern.compile(pattern, flags);
      return "";
    } catch (PatternSyntaxException e) {
      return e.getMessage();
    } catch (RuntimeException | StackOverflowError e) {
      return "crash: " + e.getClass().getSimpleName();
    }
  }

  static void generate(long seed, int count, int tokens, PrintStream out) {
    Random random = new Random(seed);
    for (int line = 0; line < count; line++) {
      StringBuilder pattern = new StringBuilder();
      for (int token = 1 + random.nextInt(tokens); token > 0; token--) {
        pattern.append(TOKENS[random.nextInt(TOKENS.length)]);
      }
      double roll = random.nextDouble();
      int flags = roll < 0.15 ? Pattern.COMMENTS : roll < 0.3 ? FLAGS[random.nextInt(FLAGS.length)] : 0;
      out.println(escape(pattern.toString()) + "\t" + flags);
    }
  }

  static boolean known(String body) {
    return compile("\\p{" + body + "}", 0).isEmpty();
  }

  @SuppressWarnings("unchecked")
  static void properties(PrintStream out) throws ReflectiveOperationException {
    Field blocks = Character.UnicodeBlock.class.getDeclaredField("map");
    blocks.setAccessible(true);
    for (String name : new TreeSet<>(((Map<String, ?>) blocks.get(null)).keySet())) {
      out.println("B\t" + name.toUpperCase());
    }
    Set<String> scripts = new TreeSet<>();
    for (Character.UnicodeScript script : Character.UnicodeScript.values()) {
      scripts.add(script.name());
    }
    Field aliases = Character.UnicodeScript.class.getDeclaredField("aliases");
    aliases.setAccessible(true);
    scripts.addAll(((Map<String, ?>) aliases.get(null)).keySet());
    scripts.forEach(name -> out.println("S\t" + name.toUpperCase()));
    Set<String> candidates = new TreeSet<>();
    String alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789&_";
    for (char first : alphabet.toCharArray()) {
      candidates.add("" + first);
      for (char second : alphabet.toCharArray()) {
        candidates.add("" + first + second);
      }
    }
    candidates.addAll(List.of(("all ASCII Alnum Alpha Blank Cntrl Digit Graph Lower Print Punct Space Upper XDigit "
        + "Alphabetic Ideographic Letter Lowercase Uppercase Titlecase Punctuation Control White_Space Hex_Digit "
        + "Join_Control Noncharacter_Code_Point Assigned Emoji Emoji_Presentation Emoji_Modifier Emoji_Modifier_Base "
        + "Emoji_Component Extended_Pictographic Word Mirrored Math Dash Hyphen Diacritic Extender").split(" ")));
    for (Method method : Character.class.getMethods()) {
      String name = method.getName();
      if (Modifier.isStatic(method.getModifiers()) && name.startsWith("is") && method.getParameterCount() == 1) {
        candidates.add("java" + name.substring(2));
        candidates.add(name.substring(2));
      }
    }
    List<String> variants = new ArrayList<>();
    for (String candidate : candidates) {
      variants.addAll(List.of(candidate, candidate.toLowerCase(), candidate.toUpperCase(), candidate.replace("_", "")));
    }
    Set<String> plain = new TreeSet<>();
    Set<String> binary = new TreeSet<>();
    for (String name : variants) {
      if (known(name)) {
        plain.add("P\t" + name);
      } else if (known("Is" + name) && !scripts.contains(name.toUpperCase())) {
        binary.add("I\t" + name.toUpperCase());
      }
    }
    plain.forEach(out::println);
    binary.forEach(out::println);
  }

  public static void main(String[] arguments) throws Exception {
    PrintStream out = new PrintStream(System.out, true, StandardCharsets.UTF_8);
    switch (arguments[0]) {
      case "gen" -> generate(Long.parseLong(arguments[1]), Integer.parseInt(arguments[2]),
          arguments.length > 3 ? Integer.parseInt(arguments[3]) : 8, out);
      case "properties" -> properties(out);
      default -> {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        for (String line = in.readLine(); line != null; line = in.readLine()) {
          if (line.isEmpty()) {
            continue;
          }
          String[] parts = line.split("\t", -1);
          String pattern = unescape(parts[0]);
          int flags = parts.length > 1 && !parts[1].isEmpty() ? Integer.parseInt(parts[1]) : 0;
          out.println(escape(pattern) + "\t" + flags + "\t" + escape(compile(pattern, flags)));
        }
      }
    }
  }
}
