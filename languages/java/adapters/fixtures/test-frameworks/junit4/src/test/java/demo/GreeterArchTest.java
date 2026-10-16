package demo;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.junit.ArchUnitRunner;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition;
import org.junit.runner.RunWith;

@RunWith(ArchUnitRunner.class)
@AnalyzeClasses(packages = "demo", importOptions = ImportOption.DoNotIncludeTests.class)
public class GreeterArchTest {
  @ArchTest
  public static final ArchRule mainCodeAvoidsJavaUtil =
      ArchRuleDefinition.noClasses()
          .that()
          .resideInAPackage("demo")
          .should()
          .dependOnClassesThat()
          .resideInAPackage("java.util");

  @ArchTest
  public static final ArchRule mainCodeAvoidsJavaIo =
      ArchRuleDefinition.noClasses()
          .that()
          .resideInAPackage("demo")
          .should()
          .dependOnClassesThat()
          .resideInAPackage("java.io");
}
