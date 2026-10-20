package demo;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

@AnalyzeClasses(packages = "demo", importOptions = ImportOption.DoNotIncludeTests.class)
class NamingArchTest {
  @ArchTest
  static final ArchRule servicesOnly = classes().should().haveSimpleNameEndingWith("Service");
}
