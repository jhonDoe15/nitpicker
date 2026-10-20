package demo

import com.tngtech.archunit.core.importer.ImportOption
import com.tngtech.archunit.junit.AnalyzeClasses
import com.tngtech.archunit.junit.ArchTest
import com.tngtech.archunit.lang.ArchRule
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes

@AnalyzeClasses(packages = ["demo"], importOptions = [ImportOption.DoNotIncludeTests::class])
class NamingArchTest {
    @ArchTest
    val servicesOnly: ArchRule = classes().should().haveSimpleNameEndingWith("Service")
}
