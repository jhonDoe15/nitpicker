import java.time.*;
import java.util.*;
import java.util.function.Function;

public class AlwaysThrowsProbe {
  static final String[] KINDS = {"Duration","Instant","LocalDate","LocalDateTime","LocalTime","MonthDay","OffsetDateTime","OffsetTime","Period","Year","YearMonth","ZonedDateTime","UUID","ByteString"};
  static final String[][] SEEDS = {
    {"PT20.345S","PT9223372036854775807S","PT-9223372036854775808S","-PT-9223372036854775808S","PT9223372036854775807.999999999S","PT-9223372036854775808.5S","-PT9223372036854775807.999999999S","PT153722867280912930M","PT2562047788015215H","P106751991167300D","P106751991167301D","PT0.S","PT.5S","PT-.5S","PT-0.5S","P1DT","Pt","PT","P","-P","pT1h2m3.4s","PT15M","PT10H","P2D","P2DT3H4M","PT-6H3M","-PT6H3M","-PT-6H+3M","PT0.5S","P1DT0.000000001S","PT1H30M15.123456789S","pt1h","PT1,5S"},
    {"2007-12-03T10:15:30.00Z","2007-12-03T10:15:30Z","2007-12-03T10:15:30+01:00","2007-12-03T23:59:60Z","2007-12-03T24:00:00Z","+12345-01-01T00:00:00Z","2007-12-03t10:15:30z","+1000000000-12-31T23:59:59Z","+1000000001-01-01T00:00:00Z","-1000000000-01-01T00:00:00Z","-1000000001-01-01T00:00:00Z","+9999999999-01-01T00:00:00Z","-9999999999-01-01T00:00:00Z","+2147483648-01-01T00:00:00Z","2007-12-03T10:15:30.123456789012345678901234567890123456789012345678901234567890Z","2007-02-29T10:15:30Z","2008-02-29T24:00:00Z","2008-02-29T24:00:01Z","2008-02-29T23:59:60.5Z","2008-02-29T23:58:60Z"},
    {"2007-12-03","2024-02-29","1900-02-29","2000-02-29","-0004-02-29","-0100-02-29","+999999999-12-31","-999999999-01-01","+1000000000-01-01","-1000000000-01-01","2007-12-03xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx","2007-13-03aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","+10000-01-01","-0001-01-01","0000-01-01","2023-02-29","2007-04-31"},
    {"2007-12-03T10:15:30","2007-12-03T10:15","2007-12-03T10:15:30.123456789","2007-12-03t10:15:30"},
    {"10:15","10:15:30","10:15:30.1","23:59:59.999999999","24:00","00:00:00.000"},
    {"--12-03","--02-29","--02-30","--04-31"},
    {"2007-12-03T10:15:30+01:00","2007-12-03T10:15:30Z","2007-12-03T10:15:30-18:00","2007-12-03T10:15:30+0100","2007-12-03T10:15:30+01","2007-12-03T10:15:30+01:00:30"},
    {"10:15:30+01:00","10:15Z","10:15:30.5-05:30"},
    {"P2Y","P3M","P4W","P5D","P1Y2M3D","P1Y2M3W4D","P-1Y2M","-P1Y2M","p1y","P2147483648D","P-2147483648D"},
    {"2007","+10000","-1","0","999999999","1000000000","+2007","02007"},
    {"2007-12","+10000-01","2007-13","-0001-12"},
    {"2007-12-03T10:15:30+01:00[Europe/Paris]","2007-12-03T10:15:30Z[UTC]","2007-12-03T10:15:30+01:00","2007-12-03T10:15:30-05:00[America/New_York]","2007-12-03T10:15:30Z[GMT+01:00]","2007-12-03T10:15:30+01:00[+01:00]","2007-12-03T10:15:30+01:00[UTC+5]","2007-12-03T10:15:30+01:00[europe/paris]","2007-12-03T10:15:30+01:00[GMT0]","2007-12-03T10:15:30+01:00[UTC+25:00]","2007-12-03T10:15:30+01:00[UT+05]","2007-12-03T10:15:30+01:00[Z]","2007-12-03T10:15:30+01:00[UTC0]","2007-12-03T10:15:30+01:00[UTCZ]","2007-12-03T10:15:30+01:00[GMT+05:30]","2007-12-03T10:15:30+01:00[GMT+19]","2007-12-03T10:15:30+01:00[+19:00]","2007-12-03T10:15:30+01:00[-05]","2007-12-03T10:15:30+01:00[America/Argentina/Buenos_Aires]","2007-12-03T10:15:30+01:00[America/Argentina/Buenos_AiresX]","2007-12-03T10:15:30+01:00[America/Argentina]","+999999999-12-31T23:59:59-18:00[Europe/Paris]","-999999999-01-01T00:00:00+18:00"},
    {"123e4567-e89b-12d3-a456-426614174000","1-2-3-4-5","0-0-0-0-0","123e4567-e89b-12d3-a456-4266141740000","ffffffff-ffff-ffff-ffff-ffffffffffff","-1-2-3-4","1--2-3-4","+1-2-3-4-5"},
    {"","00","ff","0a1B","abc","zz","0x"}
  };
  static final String ALPHA = "0123456789-+:.,TtZzPpYMWDHSs[]/_ ExUCGTabcdefgFrpis٠é";

  static String run(String kind, String s) {
    try {
      switch (kind) {
        case "Duration": Duration.parse(s); break;
        case "Instant": Instant.parse(s); break;
        case "LocalDate": LocalDate.parse(s); break;
        case "LocalDateTime": LocalDateTime.parse(s); break;
        case "LocalTime": LocalTime.parse(s); break;
        case "MonthDay": MonthDay.parse(s); break;
        case "OffsetDateTime": OffsetDateTime.parse(s); break;
        case "OffsetTime": OffsetTime.parse(s); break;
        case "Period": Period.parse(s); break;
        case "Year": Year.parse(s); break;
        case "YearMonth": YearMonth.parse(s); break;
        case "ZonedDateTime": ZonedDateTime.parse(s); break;
        case "UUID": UUID.fromString(s); break;
        case "ByteString":
          try {
            Class.forName("com.google.protobuf.ByteString").getMethod("fromHex", String.class).invoke(null, s);
          } catch (NoSuchMethodException | IllegalAccessException | ClassNotFoundException e) {
            return "";
          } catch (java.lang.reflect.InvocationTargetException e) {
            throw com.google.common.base.Throwables.getCauseAs(e.getCause(), NumberFormatException.class);
          }
          break;
      }
      return "";
    } catch (RuntimeException t) {
      return t.getClass().getSimpleName() + ": " + t.getMessage();
    }
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

  static String mutate(Random r, String s) {
    StringBuilder b = new StringBuilder(s);
    int n = 1 + r.nextInt(3);
    for (int k = 0; k < n; k++) {
      int op = r.nextInt(7);
      int at = b.length() == 0 ? 0 : r.nextInt(b.length() + 1);
      char c = ALPHA.charAt(r.nextInt(ALPHA.length()));
      if (op == 0 && b.length() > 0 && at < b.length()) b.deleteCharAt(at);
      else if (op == 1) b.insert(at, c);
      else if ((op == 2 || op == 3) && at < b.length()) b.setCharAt(at, Character.isDigit(b.charAt(at)) && op == 3 ? (char) ('0' + r.nextInt(10)) : c);
      else if (op == 4 && at < b.length()) b.insert(at, String.valueOf(r.nextInt(op == 4 && r.nextBoolean() ? 100 : 1000000000)));
      else if (op == 5) b.setLength(Math.min(b.length(), at));
      else if (op == 6 && at < b.length()) b.insert(at, b.charAt(at));
    }
    return b.toString();
  }

  static String num(Random r, int digits) {
    StringBuilder b = new StringBuilder();
    for (int i = 0; i < digits; i++) b.append((char) ('0' + r.nextInt(10)));
    return b.toString();
  }

  static String field(Random r, int usual, int max) {
    if (r.nextInt(10) < 6) return String.format("%0" + usual + "d", r.nextInt(max));
    int d = r.nextInt(10) < 7 ? usual : 1 + r.nextInt(r.nextInt(4) == 0 ? 12 : 4);
    String v = num(r, d);
    if (r.nextInt(5) == 0) v = String.format("%0" + d + "d", r.nextInt(max + 3) % (int) Math.pow(10, Math.min(d, 9)));
    return v;
  }

  static String year(Random r) {
    int k = r.nextInt(10);
    String sign = k == 0 ? "+" : k == 1 ? "-" : "";
    return sign + field(r, 4, 9999);
  }
  static String date(Random r) { return year(r) + "-" + field(r, 2, 13) + "-" + field(r, 2, 32); }
  static String time(Random r) {
    String t = field(r, 2, 25) + ":" + field(r, 2, 61);
    if (r.nextInt(4) > 0) { t += ":" + field(r, 2, 61); if (r.nextBoolean()) t += "." + num(r, r.nextInt(12)); }
    return t;
  }
  static String offset(Random r) {
    int k = r.nextInt(8);
    if (k == 0) return r.nextBoolean() ? "Z" : "z";
    String s = r.nextBoolean() ? "+" : "-";
    String h = field(r, 2, 19), m = field(r, 2, 61), x = field(r, 2, 61);
    switch (k) { case 1: return s + h; case 2: return s + h + m; case 3: return s + h + ":" + m + ":" + x; case 4: return s + h + m + x; default: return s + h + ":" + m; }
  }
  static final String[] ZONES = {"Europe/Paris","UTC","GMT","Z","UT","UTC+01:00","GMT-5","UT+3","+01:00","America/New_York","Asia/Kolkata","EST","Europe/Pariss","Etc/GMT+5","europe/paris","SystemV/AST4","Foo/Bar","UTC+18:00:01",""};
  static final String[] ALL_ZONES = new java.util.TreeSet<>(ZoneId.getAvailableZoneIds()).toArray(new String[0]);
  static String zone(Random r) {
    int k = r.nextInt(10);
    if (k < 4) return ZONES[r.nextInt(ZONES.length)];
    String z = ALL_ZONES[r.nextInt(ALL_ZONES.length)];
    if (k == 4) z = z.toLowerCase();
    if (k == 5) z = z.substring(0, r.nextInt(z.length() + 1));
    if (k == 6) z = z + ALPHA.charAt(r.nextInt(ALPHA.length()));
    if (k == 7) { String[] p = {"UTC", "UT", "GMT", "utc", "Gmt"}; z = p[r.nextInt(p.length)] + (r.nextBoolean() ? "+" : "-") + field(r, 2, 30) + (r.nextBoolean() ? ":" + field(r, 2, 61) : "") + (r.nextInt(4) == 0 ? ":" + field(r, 2, 61) : ""); }
    return z;
  }
  static String dur(Random r) {
    StringBuilder b = new StringBuilder();
    if (r.nextInt(5) == 0) b.append(r.nextBoolean() ? '-' : '+');
    b.append(r.nextInt(8) == 0 ? 'p' : 'P');
    String[] units = {"D","H","M","S"};
    boolean t = false;
    for (int i = 0; i < 4; i++) {
      if (r.nextInt(3) == 0) continue;
      if (i > 0 && !t) { b.append(r.nextInt(8) == 0 ? 't' : 'T'); t = true; }
      if (r.nextInt(6) == 0) b.append(r.nextBoolean() ? '-' : '+');
      b.append(num(r, 1 + r.nextInt(r.nextInt(4) == 0 ? 20 : 3)));
      if (i == 3 && r.nextInt(3) == 0) b.append(r.nextBoolean() ? '.' : ',').append(num(r, r.nextInt(11)));
      b.append(r.nextInt(10) == 0 ? units[i].toLowerCase() : units[i]);
    }
    return b.toString();
  }
  static String per(Random r) {
    StringBuilder b = new StringBuilder();
    if (r.nextInt(5) == 0) b.append(r.nextBoolean() ? '-' : '+');
    b.append(r.nextInt(8) == 0 ? 'p' : 'P');
    for (String u : new String[] {"Y","M","W","D"}) {
      if (r.nextInt(3) == 0) continue;
      if (r.nextInt(6) == 0) b.append(r.nextBoolean() ? '-' : '+');
      b.append(num(r, 1 + r.nextInt(r.nextInt(4) == 0 ? 12 : 3)));
      b.append(r.nextInt(10) == 0 ? u.toLowerCase() : u);
    }
    return b.toString();
  }
  static String hex(Random r, int n) {
    String h = "0123456789abcdefABCDEF";
    StringBuilder b = new StringBuilder();
    for (int i = 0; i < n; i++) b.append(h.charAt(r.nextInt(h.length())));
    return b.toString();
  }
  static String structured(Random r, String kind) {
    switch (kind) {
      case "Duration": return dur(r);
      case "Period": return per(r);
      case "LocalDate": return date(r);
      case "LocalTime": return time(r);
      case "LocalDateTime": return date(r) + (r.nextInt(10) == 0 ? "t" : "T") + time(r);
      case "Instant": case "OffsetDateTime": return date(r) + "T" + time(r) + offset(r);
      case "OffsetTime": return time(r) + offset(r);
      case "ZonedDateTime": return date(r) + "T" + time(r) + offset(r) + (r.nextInt(4) > 0 ? "[" + zone(r) + "]" : "");
      case "MonthDay": return "--" + field(r, 2, 13) + "-" + field(r, 2, 32);
      case "YearMonth": return year(r) + "-" + field(r, 2, 13);
      case "Year": return (r.nextInt(6) == 0 ? (r.nextBoolean() ? "+" : "-") : "") + num(r, 1 + r.nextInt(r.nextInt(3) == 0 ? 12 : 4));
      case "UUID": {
        StringBuilder b = new StringBuilder();
        int parts = r.nextInt(6) == 0 ? 3 + r.nextInt(4) : 5;
        int[] usual = {8, 4, 4, 4, 12};
        for (int i = 0; i < parts; i++) { if (i > 0) b.append('-'); b.append(hex(r, r.nextInt(4) == 0 ? r.nextInt(18) : usual[Math.min(i, 4)])); }
        return b.toString();
      }
      default: return hex(r, r.nextInt(12));
    }
  }

  public static void main(String[] a) {
    int per = Integer.parseInt(a[0]);
    Random r = new Random(Long.parseLong(a.length > 1 ? a[1] : "1"));
    StringBuilder out = new StringBuilder();
    for (int k = 0; k < KINDS.length; k++) {
      String kind = KINDS[k];
      LinkedHashSet<String> inputs = new LinkedHashSet<>(Arrays.asList(SEEDS[k]));
      while (inputs.size() < per) {
        String base = r.nextInt(3) == 0 ? SEEDS[k][r.nextInt(SEEDS[k].length)] : structured(r, kind);
        inputs.add(r.nextInt(3) == 0 ? mutate(r, base) : base);
      }
      for (String s : inputs) out.append(kind).append('\t').append(esc(s)).append('\t').append(esc(run(kind, s))).append('\n');
    }
    System.out.print(out);
  }
}
