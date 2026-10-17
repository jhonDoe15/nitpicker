import org.gradle.api.Plugin
import org.gradle.api.Project

class FakeKotlinPlugin implements Plugin<Project> {
    void apply(Project project) {
        def kotlinSet = [kotlin: [srcDirs: [project.file('src/main/kotlin')] as Set]]
        project.extensions.create('kotlin', FakeKotlinExtension, [main: kotlinSet])
    }
}

class FakeKotlinExtension {
    Map sourceSets
    FakeKotlinExtension(Map sourceSets) { this.sourceSets = new FakeSets(sourceSets) }
}

class FakeSets extends HashMap {
    FakeSets(Map m) { putAll(m) }
    def findByName(String name) { get(name) }
}
