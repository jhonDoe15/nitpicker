export const SOURCES = 'src/main/kotlin/demo';

export const BUILD = {
  'build.gradle.kts': `plugins { kotlin("jvm") version "2.0.21" }
repositories { mavenCentral() }
dependencies {
    implementation("org.springframework.data:spring-data-commons:3.3.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.1")
}
`,
  'settings.gradle.kts': 'rootProject.name = "demo"\n',
};

type Shape = { readonly file: string; readonly before: string; readonly after: string };

const REPOSITORY = `package demo

import org.springframework.data.repository.CrudRepository

class Item(var name: String = "")

interface ItemRepository : CrudRepository<Item, Long>
`;

export const SUPPORT = { [`${SOURCES}/ItemRepository.kt`]: REPOSITORY };

export const SHAPES: readonly Shape[] = [
  {
    file: 'Sorts.kt',
    before: `package demo

class Price(val amount: Int)

class Sorts {
    fun cheapest(prices: List<Price>): Price = prices.sortedBy { it.amount }.first()

    fun dearest(prices: List<Price>): Price? = prices.sortedByDescending { it.amount }.firstOrNull()

    fun lowest(values: List<Double>): Double = values.sorted().first()
}
`,
    after: `package demo

class Price(val amount: Int)

class Sorts {
    fun cheapest(prices: List<Price>): Price = prices.minWith(compareBy { it.amount })

    fun dearest(prices: List<Price>): Price? = prices.maxWithOrNull(compareBy { it.amount })

    fun lowest(values: List<Double>): Double = values.minWith(naturalOrder())
}
`,
  },
  {
    file: 'Regexes.kt',
    before: `package demo

class Regexes {
    fun dashes(text: String): String = text.replace(Regex("_"), "-")

    fun parts(text: String): List<String> = text.split(Regex(","))
}
`,
    after: `package demo

class Regexes {
    fun dashes(text: String): String = text.replace("_", "-")

    fun parts(text: String): List<String> = text.split(",")
}
`,
  },
  {
    file: 'Saves.kt',
    before: `package demo

class Saves(private val items: ItemRepository) {
    fun store(all: List<Item>) {
        for (item in all) {
            items.save(item)
        }
    }

    fun drop(ids: List<Long>) {
        ids.forEach { items.deleteById(it) }
    }
}
`,
    after: `package demo

class Saves(private val items: ItemRepository) {
    fun store(all: List<Item>) {
        items.saveAll(all)
    }

    fun drop(ids: List<Long>) {
        items.deleteAllById(ids)
    }
}
`,
  },
  {
    file: 'Exists.kt',
    before: `package demo

import org.springframework.data.repository.findByIdOrNull

class Exists(private val items: ItemRepository) {
    fun known(id: Long): Boolean = items.findById(id).isPresent

    fun missing(id: Long): Boolean = items.findByIdOrNull(id) == null
}
`,
    after: `package demo

class Exists(private val items: ItemRepository) {
    fun known(id: Long): Boolean = items.existsById(id)

    fun missing(id: Long): Boolean = !items.existsById(id)
}
`,
  },
  {
    file: 'Sleeps.kt',
    before: `package demo

import kotlinx.coroutines.yield

class Sleeps {
    suspend fun pause() {
        yield()
        Thread.sleep(100)
    }
}
`,
    after: `package demo

import kotlinx.coroutines.delay
import kotlinx.coroutines.yield

class Sleeps {
    suspend fun pause() {
        yield()
        delay(100)
    }
}
`,
  },
  {
    file: 'Memory.kt',
    before: `package demo

class Memory {
    fun release(cache: MutableMap<String, String>) {
        cache.clear()
        System.gc()
    }
}
`,
    after: `package demo

class Memory {
    fun release(cache: MutableMap<String, String>) {
        cache.clear()
    }
}
`,
  },
];

export const RULES = [
  'kotlin-source/SortForExtreme',
  'kotlin-source/PlainTextRegex',
  'pmd/SpringDataNoSaveInLoop',
  'effects/EntityLoadedForExistence',
  'detekt/detekt.coroutines.SleepInsteadOfDelay',
  'detekt/detekt.potential-bugs.ExplicitGarbageCollectionCall',
].flatMap((rule) => ['--rule', rule]);
