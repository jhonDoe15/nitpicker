package demo;

import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition;
import org.testng.annotations.Test;

public class GreeterArchTest {
  @Test
  public void mainCodeAvoidsJavaUtil() {
    ArchRuleDefinition.noClasses()
        .that()
        .resideInAPackage("demo")
        .should()
        .dependOnClassesThat()
        .resideInAPackage("java.util")
        .check(new ClassFileImporter().importPackages("demo"));
  }

  @Test
  public void mainCodeAvoidsJavaIo() {
    ArchRuleDefinition.noClasses()
        .that()
        .resideInAPackage("demo")
        .should()
        .dependOnClassesThat()
        .resideInAPackage("java.io")
        .check(new ClassFileImporter().importPackages("demo"));
  }
}
