package nitpicker.fix;

import static com.google.errorprone.BugPattern.SeverityLevel.WARNING;

import com.google.errorprone.BugPattern;

@BugPattern(
    summary = "Collects the entities a loop writes as one-element batches and writes them with one batch call.",
    severity = WARNING)
public final class SpringDataBatchOfOne extends SpringDataNoSaveInLoop {
  @Override
  boolean oneElement() {
    return true;
  }
}
