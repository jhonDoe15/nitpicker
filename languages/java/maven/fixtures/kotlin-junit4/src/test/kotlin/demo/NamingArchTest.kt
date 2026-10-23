package demo

import com.tngtech.archunit.core.importer.ImportOption
import com.tngtech.archunit.junit.AnalyzeClasses
import com.tngtech.archunit.junit.ArchTest
import com.tngtech.archunit.junit.ArchUnitRunner
import com.tngtech.archunit.lang.ArchRule
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes
import org.junit.runner.RunWith

@RunWith(ArchUnitRunner::class)
@AnalyzeClasses(packages = ["demo"], importOptions = [ImportOption.DoNotIncludeTests::class])
class NamingArchTest {
    @ArchTest
    val servicesOnly: ArchRule = classes().should().haveSimpleNameEndingWith("Service")
}
