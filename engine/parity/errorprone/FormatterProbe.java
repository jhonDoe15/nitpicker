import java.math.BigDecimal;
import java.math.BigInteger;
import java.io.*;
import java.time.Instant;
import java.time.ZoneId;
import java.util.*;

public class FormatterProbe {
  static Object arg(String t) {
    switch (t.charAt(0)) {
      case 'n': return null;
      case 'z': return false;
      case 'b': return (byte) 1;
      case 's': return (short) 2;
      case 'i': return t.length() > 1 ? Integer.parseInt(t.substring(1)) : 3;
      case 'l': return 4L;
      case 'c': return t.length() > 1 ? (char) Integer.parseInt(t.substring(1)) : 'c';
      case 'f': return 5.0f;
      case 'd': return 6.0d;
      case 'S': return "string";
      case 'D': return BigDecimal.valueOf(42.0d);
      case 'I': return BigInteger.valueOf(43L);
      case 'T': return new Date();
      case 'C': return new GregorianCalendar();
      case 'N': return Instant.now();
      case 'Z': return Instant.now().atZone(ZoneId.systemDefault());
      default: return new Formattable() {
          public void formatTo(Formatter formatter, int flags, int width, int precision) { formatter.format("hello"); }
        };
    }
  }

  static String validate(String formatString, Object[] arguments) {
    try {
      String unused = String.format(formatString, arguments);
    } catch (DuplicateFormatFlagsException e) {
      return String.format("duplicate format flags: %s", e.getFlags());
    } catch (FormatFlagsConversionMismatchException e) {
      return String.format("format specifier '%%%s' is not compatible with the given flag(s): %s", e.getConversion(), e.getFlags());
    } catch (IllegalFormatCodePointException e) {
      return String.format("invalid Unicode code point: %x", e.getCodePoint());
    } catch (IllegalFormatConversionException e) {
      return String.format("illegal format conversion: '%s' cannot be formatted using '%%%s'", e.getArgumentClass().getName().replace("FormatterProbe$1", "com.google.errorprone.bugpatterns.formatstring.FormatStringValidation$2"), e.getConversion());
    } catch (IllegalFormatFlagsException e) {
      return String.format("illegal format flags: %s", e.getFlags());
    } catch (IllegalFormatPrecisionException e) {
      return String.format("illegal format precision: %d", e.getPrecision());
    } catch (IllegalFormatWidthException e) {
      return String.format("illegal format width: %s", e.getWidth());
    } catch (MissingFormatArgumentException e) {
      return String.format("missing argument for format specifier '%s'", e.getFormatSpecifier());
    } catch (MissingFormatWidthException e) {
      return String.format("missing format width: %s", e.getFormatSpecifier());
    } catch (UnknownFormatConversionException e) {
      return e.getConversion().equals("l") ? "%l is not a valid format specifier; use %d to format integral types as a decimal integer, and %f, %g or %e to format floating point types (depending on your formatting needs)" : String.format("unknown format conversion: '%s'", e.getConversion());
    } catch (UnknownFormatFlagsException e) {
      return String.format("unknown format flag(s): %s", e.getFlags());
    } catch (IllegalFormatException e) {
      return e.getMessage();
    } catch (RuntimeException | OutOfMemoryError e) {
      return "crash: " + e.getClass().getName();
    }
    for (int i = 0; i <= arguments.length; i++) {
      try {
        String.format(formatString, Arrays.copyOf(arguments, i));
        return i == arguments.length ? "" : String.format("extra format arguments: used %d, provided %d", i, arguments.length);
      } catch (IllegalFormatException e) {
      }
    }
    return "";
  }

  static String esc(String s) {
    StringBuilder b = new StringBuilder();
    for (char c : s.toCharArray()) {
      if (c == '\\') b.append("\\\\");
      else if (c == '\t') b.append("\\t");
      else if (c == '\n') b.append("\\n");
      else if (c < 32 || c > 126) b.append(String.format("\\u%04x", (int) c));
      else b.append(c);
    }
    return b.toString();
  }

  static String unesc(String s) {
    StringBuilder b = new StringBuilder();
    for (int i = 0; i < s.length(); i++) {
      char c = s.charAt(i);
      if (c != '\\') { b.append(c); continue; }
      char n = s.charAt(++i);
      if (n == 't') b.append('\t');
      else if (n == 'n') b.append('\n');
      else if (n == 'u') { b.append((char) Integer.parseInt(s.substring(i + 1, i + 5), 16)); i += 4; }
      else b.append(n);
    }
    return b.toString();
  }

  static final String KINDS = "nzbsilcfdSDITCNZF";
  static final String[] PIECES = {"%", "%", "%", "%", "%", "1$", "2$", "3$", "0$", "-", "#", "+", " ", "0", ",", "(", "<",
    "1", "2", "5", "10", "0", "99999999999", ".", ".2", ".0", ".5", "t", "T", "s", "S", "d", "x", "X", "o", "c", "C",
    "b", "B", "h", "H", "e", "E", "f", "g", "G", "a", "A", "n", "%", "l", "Y", "y", "Q", "H", "M", "z", "Z", "q", "j",
    "F", "D", "r", "R", "c", "k", "L", "N", "p", "I", "e", "s", "x", " ", "a", "w", "u", "\n", "!", "{", "@", "é", "9"};

  static String randomFormat(Random r) {
    StringBuilder b = new StringBuilder();
    int n = 1 + r.nextInt(8);
    for (int i = 0; i < n; i++) {
      if (r.nextInt(4) == 0) {
        b.append("%");
        if (r.nextInt(3) == 0) b.append(1 + r.nextInt(3)).append('$');
        int flags = r.nextInt(3);
        for (int f = 0; f < flags; f++) b.append("-#+ 0,(<".charAt(r.nextInt(8)));
        if (r.nextInt(3) == 0) b.append(1 + r.nextInt(12));
        if (r.nextInt(4) == 0) b.append('.').append(r.nextInt(6));
        if (r.nextInt(5) == 0) b.append(r.nextBoolean() ? 't' : 'T');
        b.append("bBhHsScCdoxXeEfgGaAtT%nYyQMzZjFDrRkLNpIlqw".charAt(r.nextInt(42)));
      } else {
        b.append(PIECES[r.nextInt(PIECES.length)]);
      }
    }
    return b.toString();
  }

  static String validFormat(Random r) {
    StringBuilder b = new StringBuilder();
    int n = 1 + r.nextInt(4);
    for (int i = 0; i < n; i++) {
      if (r.nextBoolean()) b.append(" x=");
      b.append('%');
      if (r.nextInt(6) == 0) b.append(1 + r.nextInt(4)).append('$');
      if (r.nextInt(3) == 0) b.append("-#+ 0,(<".charAt(r.nextInt(8)));
      if (r.nextInt(8) == 0) b.append("-#+ 0,(<".charAt(r.nextInt(8)));
      if (r.nextInt(3) == 0) b.append(1 + r.nextInt(20));
      if (r.nextInt(4) == 0) b.append('.').append(r.nextInt(4));
      if (r.nextInt(6) == 0) {
        b.append(r.nextBoolean() ? 't' : 'T').append("HIklMSLNpzZsQBbhAaCYyjmdeRTrDFc".charAt(r.nextInt(31)));
      } else {
        b.append("bBhHsSsssscCdddxXoeEfffgGaAn%".charAt(r.nextInt(29)));
      }
    }
    return b.toString();
  }

  static String randomArgs(Random r) {
    int n = r.nextInt(5);
    StringBuilder b = new StringBuilder();
    for (int i = 0; i < n; i++) {
      if (i > 0) b.append(',');
      char k = KINDS.charAt(r.nextInt(KINDS.length()));
      b.append(k);
      if (k == 'i' && r.nextInt(3) == 0) {
        int[] values = {-1, 0, 0x10FFFF, 0x110000, 0xD800, Integer.MIN_VALUE, 65};
        b.append(values[r.nextInt(values.length)]);
      }
    }
    return b.toString();
  }

  static Object[] parseArgs(String spec) {
    if (spec.isEmpty()) return new Object[0];
    String[] parts = spec.split(",");
    Object[] out = new Object[parts.length];
    for (int i = 0; i < parts.length; i++) out[i] = arg(parts[i]);
    return out;
  }

  public static void main(String[] a) throws IOException {
    PrintWriter out = new PrintWriter(new BufferedWriter(new OutputStreamWriter(System.out, "UTF-8")));
    if (a[0].startsWith("gen")) {
      Random r = new Random(Long.parseLong(a[2]));
      long count = Long.parseLong(a[1]);
      for (long i = 0; i < count; i++) {
        String f = a[0].equals("gen") ? randomFormat(r) : validFormat(r);
        String args = randomArgs(r);
        out.println(esc(f) + "\t" + args + "\t" + esc(validate(f, parseArgs(args))));
      }
    } else {
      BufferedReader in = new BufferedReader(new InputStreamReader(System.in, "UTF-8"));
      for (String line; (line = in.readLine()) != null; ) {
        String[] p = line.split("\t", -1);
        String f = unesc(p[0]);
        String args = p.length > 1 ? p[1] : "";
        out.println(p[0] + "\t" + args + "\t" + esc(validate(f, parseArgs(args))));
      }
    }
    out.flush();
  }
}
