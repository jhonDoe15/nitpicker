package com.example.library

import com.tngtech.archunit.core.domain.JavaClasses
import com.tngtech.archunit.junit.AnalyzeClasses
import com.tngtech.archunit.junit.ArchTest
import com.tngtech.archunit.lang.ArchRule
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses

@AnalyzeClasses(packages = ["com.example.library"])
class FeatureBoundariesArchTest {
    @ArchTest
    fun catalogInternalsStayInside(classes: JavaClasses) = internalsStayInside("catalog").check(classes)

    @ArchTest
    fun membersInternalsStayInside(classes: JavaClasses) = internalsStayInside("members").check(classes)

    @ArchTest
    fun loansInternalsStayInside(classes: JavaClasses) = internalsStayInside("loans").check(classes)

    @ArchTest
    fun finesInternalsStayInside(classes: JavaClasses) = internalsStayInside("fines").check(classes)

    private fun internalsStayInside(feature: String): ArchRule {
        val top = "com.example.library.$feature"
        return noClasses()
            .that()
            .resideOutsideOfPackage("$top..")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage("$top.domain..", "$top.adapters..")
            .because("a feature is used only through the public declarations of its top package")
    }
}
