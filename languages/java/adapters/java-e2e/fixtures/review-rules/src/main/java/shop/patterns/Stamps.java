package shop.patterns;

import java.text.SimpleDateFormat;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.util.Locale;

public class Stamps {
  static final String CLOCK = "HH:MM";
  static final String DATE = "dd.mm.yyyy";
  static final String PLAIN = "yyyy-MM-dd HH:mm";

  SimpleDateFormat legacyMonthAfterHour() {
    return new SimpleDateFormat("dd.MM.yyyy HH:MM", Locale.ROOT); // violation: LegacyCalendarApi
  }

  SimpleDateFormat legacyMinuteInDate() {
    return new SimpleDateFormat("dd.mm.yy HH:mm:ss", Locale.ROOT); // violation: DatePatternLetterSlip, LegacyCalendarApi
  }

  SimpleDateFormat legacyOddYear() {
    return new SimpleDateFormat("dd/MMM/yyy:HH:mm:ss", Locale.ROOT); // violation: DatePatternLetterSlip, LegacyCalendarApi
  }

  SimpleDateFormat legacyFiveYears() {
    return new SimpleDateFormat("yyyyyMMdd", Locale.ROOT); // violation: DatePatternLetterSlip, LegacyCalendarApi
  }

  SimpleDateFormat legacyOneToTwentyFour() {
    return new SimpleDateFormat("yyyyMMddkkmmss", Locale.ROOT); // violation: DatePatternLetterSlip, LegacyCalendarApi
  }

  SimpleDateFormat legacyMinutesMissing() {
    return new SimpleDateFormat("dd MMM yyyy HH:ss", Locale.ROOT); // violation: DatePatternLetterSlip, LegacyCalendarApi
  }

  SimpleDateFormat legacyBothClocks() {
    return new SimpleDateFormat("yyyy-MM-dd HH:mm 'or' hh:mm", Locale.ROOT); // violation: DatePatternLetterSlip, LegacyCalendarApi
  }

  SimpleDateFormat legacyConstants() {
    SimpleDateFormat clock = new SimpleDateFormat(CLOCK, Locale.ROOT); // violation: DatePatternLetterSlip, LegacyCalendarApi
    clock.applyPattern(DATE); // violation: DatePatternLetterSlip
    return clock;
  }

  DateTimeFormatter modernMonthAfterHour() {
    return DateTimeFormatter.ofPattern("dd.MM.yyyy HH:MM"); // violation: DatePatternLetterSlip
  }

  DateTimeFormatter modernMinuteInDate() {
    return DateTimeFormatter.ofPattern("dd.mm.yy HH:mm:ss", Locale.ROOT); // violation: DatePatternLetterSlip
  }

  DateTimeFormatter modernDuplicateMonth() {
    return DateTimeFormatter.ofPattern("yyyy-MM-dd HH:MM"); // violation: DatePatternLetterSlip
  }

  DateTimeFormatter modernTwelveHourWithoutMarker() {
    return DateTimeFormatter.ofPattern("yyyy-MM-dd hh:mm"); // violation: DatePatternLetterSlip
  }

  DateTimeFormatter modernBothClocks() {
    return DateTimeFormatter.ofPattern("HH:mm hh"); // violation: DatePatternLetterSlip
  }

  DateTimeFormatter modernOddYear() {
    return DateTimeFormatter.ofPattern("yyy-MM-dd"); // violation: DatePatternLetterSlip
  }

  DateTimeFormatter modernHalfDayHours() {
    return DateTimeFormatter.ofPattern("KK:mm"); // violation: DatePatternLetterSlip
  }

  DateTimeFormatter modernConstant() {
    return DateTimeFormatter.ofPattern(CLOCK); // violation: DatePatternLetterSlip
  }

  DateTimeFormatterBuilder builder() {
    return new DateTimeFormatterBuilder().appendPattern("HH:ss"); // violation: DatePatternLetterSlip
  }

  SimpleDateFormat legacyAllowed() {
    return new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", Locale.ROOT); // violation: LegacyCalendarApi
  }

  SimpleDateFormat legacyTwelveHourWithMarker() {
    return new SimpleDateFormat("hh:mm a", Locale.ROOT); // violation: LegacyCalendarApi
  }

  SimpleDateFormat legacyQuoted() {
    return new SimpleDateFormat("yyyy-MM-dd'kk yyy mm HH:MM'", Locale.ROOT); // violation: LegacyCalendarApi
  }

  SimpleDateFormat legacyHourBeforeMinuteDash() {
    return new SimpleDateFormat("HH:mm-dd", Locale.ROOT); // violation: LegacyCalendarApi
  }

  SimpleDateFormat legacySingleHour() {
    return new SimpleDateFormat("h:mm", Locale.ROOT); // violation: DatePatternLetterSlip, LegacyCalendarApi
  }

  SimpleDateFormat legacyTwelveHourPadded() {
    return new SimpleDateFormat("yyyy-MM-dd hh:mm", Locale.ROOT); // violation: LegacyCalendarApi
  }

  SimpleDateFormat legacyConstantAllowed() {
    return new SimpleDateFormat(PLAIN, Locale.ROOT); // violation: LegacyCalendarApi
  }

  SimpleDateFormat legacyWeekYear() {
    return new SimpleDateFormat("YYYY-'W'ww", Locale.ROOT); // violation: LegacyCalendarApi
  }

  SimpleDateFormat legacyYear() {
    return new SimpleDateFormat("yy/MM/dd HH:mm", Locale.ROOT); // violation: LegacyCalendarApi
  }

  DateTimeFormatter modernAllowed() {
    return DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm:ss.SSS");
  }

  DateTimeFormatter modernTwelveHourWithMarker() {
    return DateTimeFormatter.ofPattern("hh:mm a", Locale.ROOT);
  }

  DateTimeFormatter modernZoned() {
    return DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssXXX");
  }

  DateTimeFormatter modernDigitsOnly() {
    return DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
  }

  String notAPattern(String text) {
    return text.replace("HH:MM", "dd.mm.yyy").concat("kk hh yyy");
  }

  DateTimeFormatter notALiteral(String pattern) {
    return DateTimeFormatter.ofPattern(pattern);
  }

  DateTimeFormatter isoDate() {
    return DateTimeFormatter.ISO_LOCAL_DATE;
  }
}
