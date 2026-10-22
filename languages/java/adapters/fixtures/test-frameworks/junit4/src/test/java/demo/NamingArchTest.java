package demo;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.junit.ArchUnitRunner;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.runner.RunWith;

@RunWith(ArchUnitRunner.class)
@AnalyzeClasses(packages = "demo", importOptions = ImportOption.DoNotIncludeTests.class)
public class NamingArchTest {
  @ArchTest
  public static final ArchRule servicesOnly =
      classes().should().haveSimpleNameEndingWith("Service");
}
