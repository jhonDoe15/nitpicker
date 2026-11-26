import java.text.DateFormat;
import java.text.SimpleDateFormat;
import java.util.Date;

class S21DateFormatConstant {
  private static final DateFormat DATE_FORMAT = new SimpleDateFormat("yyyy");
  static final SimpleDateFormat OTHER_FORMAT = new SimpleDateFormat("yyyy");
  static final DateFormat LONG_FORMAT = DateFormat.getDateInstance();
  public static final DateFormat _LEADING_UNDERSCORE_1 = DateFormat.getDateInstance();
  private static final DateFormat lowerCase = new SimpleDateFormat("yyyy");
  private static final DateFormat NOT_FINAL_UNINITIALIZED;
  private static DateFormat NOT_FINAL = new SimpleDateFormat("yyyy");
  private final DateFormat NOT_STATIC = new SimpleDateFormat("yyyy");
  private static final Object NOT_A_FORMAT = new Object();
  private static final String DATE_STRING = "x";

  static {
    NOT_FINAL_UNINITIALIZED = new SimpleDateFormat("y");
  }

  String format(Date date) {
    return DATE_FORMAT.format(date) + OTHER_FORMAT.format(date) + S21DateFormatConstant.LONG_FORMAT.format(date);
  }

  @SuppressWarnings("DateFormatConstant")
  private static final DateFormat SUPPRESSED = new SimpleDateFormat("yyyy");
}

interface S21DateFormatInterface {
  DateFormat IFACE_FORMAT = DateFormat.getDateInstance();
}
