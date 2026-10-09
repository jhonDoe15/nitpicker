package demo;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

@AnalyzeClasses(packages = "demo")
class ArchitectureTest {
  @ArchTest
  static final ArchRule no_classes_use_legacy_date =
      noClasses().should().dependOnClassesThat().haveFullyQualifiedName("java.util.Date");
}
