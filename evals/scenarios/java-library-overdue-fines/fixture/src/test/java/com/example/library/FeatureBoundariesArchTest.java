package com.example.library;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

@AnalyzeClasses(packages = "com.example.library")
class FeatureBoundariesArchTest {
  @ArchTest static final ArchRule CATALOG = internalsStayInside("catalog");
  @ArchTest static final ArchRule MEMBERS = internalsStayInside("members");
  @ArchTest static final ArchRule LOANS = internalsStayInside("loans");
  @ArchTest static final ArchRule FINES = internalsStayInside("fines");

  private static ArchRule internalsStayInside(String feature) {
    String top = "com.example.library." + feature;
    return noClasses()
        .that()
        .resideOutsideOfPackage(top + "..")
        .should()
        .dependOnClassesThat()
        .resideInAnyPackage(top + ".domain..", top + ".adapters..")
        .because("a feature is used only through the public classes of its top package");
  }
}
