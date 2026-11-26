import javax.inject.Inject;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.RuleChain;
import org.junit.rules.TemporaryFolder;
import org.junit.rules.TestRule;
import org.junit.runner.RunWith;
import org.junit.runners.JUnit4;

@RunWith(JUnit4.class)
public final class S22Rules {
  public final TemporaryFolder folder = new TemporaryFolder();
  @Rule public final TemporaryFolder annotated = new TemporaryFolder();
  public final TemporaryFolder chained = new TemporaryFolder();
  @Rule public final RuleChain chain = RuleChain.outerRule(chained);
  @Inject public final TemporaryFolder injected = new TemporaryFolder();
  private final TemporaryFolder hidden = new TemporaryFolder();
  final TemporaryFolder packaged = new TemporaryFolder();
  TestRule lambda = base -> null;
  public final TemporaryFolder used = new TemporaryFolder();
  public final TemporaryFolder methodOnly = new TemporaryFolder();
  public final TemporaryFolder thisAccess = new TemporaryFolder();
  public final TemporaryFolder thisLeak = new TemporaryFolder();
  public final TemporaryFolder viaReference = new TemporaryFolder();
  protected static TemporaryFolder shared = new TemporaryFolder();
  public final Object notARule = new Object();
  @SuppressWarnings("RuleNotRun")
  public final TemporaryFolder suppressed = new TemporaryFolder();
  public final TemporaryFolder first = new TemporaryFolder(), second = new TemporaryFolder();

  @Test
  public void usesRules() {
    System.out.println(used);
    methodOnly.newFile();
    this.thisAccess.newFile();
    Object leaked = this.thisLeak;
    java.util.function.Supplier<java.io.File> reference = viaReference::newFile;
    TemporaryFolder folder = null;
    folder.newFile();
  }

  @Test
  public void other(TemporaryFolder methodOnly) {
    methodOnly.newFile();
  }

  static class Nested {
    public final TemporaryFolder nestedFolder = new TemporaryFolder();
  }

  static class NotATest {
    public final TemporaryFolder plain = new TemporaryFolder();
  }
}

class S22RulesPlain {
  public final TemporaryFolder folder = new TemporaryFolder();
}

abstract class S22RulesAbstract {
  public final TemporaryFolder folder = new TemporaryFolder();

  @Test
  public void test() {}
}
