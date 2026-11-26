import java.util.TimeZone;
import org.joda.time.DateTimeZone;

class S21TimeZone {
  static final String CONSTANT = "PST";

  void ids(String dynamic) {
    TimeZone.getTimeZone("EST");
    TimeZone.getTimeZone("HST");
    TimeZone.getTimeZone("MST");
    TimeZone.getTimeZone("PST");
    TimeZone.getTimeZone("AST");
    TimeZone.getTimeZone("CST");
    TimeZone.getTimeZone("NST");
    TimeZone.getTimeZone("IST");
    TimeZone.getTimeZone("JST");
    TimeZone.getTimeZone("BST");
    TimeZone.getTimeZone("SST");
    TimeZone.getTimeZone("VST");
    TimeZone.getTimeZone("ACT");
    TimeZone.getTimeZone("AET");
    TimeZone.getTimeZone("AGT");
    TimeZone.getTimeZone("ART");
    TimeZone.getTimeZone("BET");
    TimeZone.getTimeZone("CAT");
    TimeZone.getTimeZone("CNT");
    TimeZone.getTimeZone("CTT");
    TimeZone.getTimeZone("EAT");
    TimeZone.getTimeZone("ECT");
    TimeZone.getTimeZone("IET");
    TimeZone.getTimeZone("MIT");
    TimeZone.getTimeZone("NET");
    TimeZone.getTimeZone("PLT");
    TimeZone.getTimeZone("PNT");
    TimeZone.getTimeZone("PRT");
    TimeZone.getTimeZone(CONSTANT);
    TimeZone.getTimeZone("P" + "ST");
    TimeZone.getTimeZone("America/Los_Angeles");
    TimeZone.getTimeZone("GMT");
    TimeZone.getTimeZone("UTC");
    TimeZone.getTimeZone("pst");
    TimeZone.getTimeZone("PDT");
    TimeZone.getTimeZone(dynamic);
  }

  void joda() {
    DateTimeZone.forTimeZone(TimeZone.getTimeZone("EST"));
    DateTimeZone.forTimeZone(TimeZone.getTimeZone("HST"));
    DateTimeZone.forTimeZone(TimeZone.getTimeZone("MST"));
    DateTimeZone.forTimeZone(TimeZone.getTimeZone("PST"));
    DateTimeZone.forTimeZone(TimeZone.getTimeZone("IST"));
    DateTimeZone.forTimeZone(TimeZone.getTimeZone("America/Denver"));
    TimeZone.getTimeZone("EST").getID();
  }

  @SuppressWarnings("ThreeLetterTimeZoneID")
  void suppressed() {
    TimeZone.getTimeZone("PST");
  }
}
