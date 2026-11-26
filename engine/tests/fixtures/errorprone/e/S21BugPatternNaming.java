import static com.google.errorprone.BugPattern.SeverityLevel.WARNING;

import com.google.errorprone.BugPattern;
import com.google.errorprone.bugpatterns.BugChecker;

@BugPattern(name = "Trololol", severity = WARNING, summary = "")
class S21NamingPositive extends BugChecker {}

@BugPattern(severity = WARNING, summary = "")
class S21NamingNegative extends BugChecker {}

@BugPattern(name = "S21NamingRedundant", severity = WARNING, summary = "")
class S21NamingRedundant extends BugChecker {}

@BugPattern(severity = WARNING, summary = "", name = "S21NamingLast")
class S21NamingLast extends BugChecker {}

@BugPattern(
    severity = WARNING,
    name = "S21NamingMiddle",
    summary = "")
class S21NamingMiddle extends BugChecker {}

@BugPattern(name = "", severity = WARNING, summary = "")
class S21NamingEmpty extends BugChecker {}

@BugPattern(name = "Other", severity = WARNING, summary = "")
class S21NamingNotChecker {}

@BugPattern(name = "Other", severity = WARNING, summary = "")
abstract class S21NamingAbstract extends BugChecker {}

@BugPattern(name = "Sub", severity = WARNING, summary = "")
class S21NamingSub extends S21NamingNegative {}

class S21NamingNoAnnotation extends BugChecker {}

@SuppressWarnings("BugPatternNaming")
@BugPattern(name = "Suppressed", severity = WARNING, summary = "")
class S21NamingSuppressed extends BugChecker {}
