package demo.formats

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.google.gson.Gson
import jakarta.annotation.PostConstruct
import jakarta.xml.bind.JAXBContext
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.concurrent.ConcurrentHashMap
import java.util.regex.Pattern
import kotlinx.serialization.json.Json

private const val DAY_PATTERN = "yyyy-MM-dd"
private val SHARED = jacksonObjectMapper()

class Formats(private val gson: Gson = Gson()) {
    private val day = DateTimeFormatter.ofPattern(DAY_PATTERN)
    private val lenient by lazy { Json { ignoreUnknownKeys = true } }
    private val contexts = ConcurrentHashMap<Class<*>, JAXBContext>()
    private var lazyMapper: ObjectMapper? = null
    private lateinit var started: ObjectMapper

    init {
        started = ObjectMapper()
    }

    fun toJson(value: Any): String = ObjectMapper().writeValueAsString(value)

    fun local(value: Any): String {
        val mapper = jacksonObjectMapper()
        return mapper.writeValueAsString(value)
    }

    fun day(date: LocalDate): String = date.format(DateTimeFormatter.ofPattern("yyyy-MM-dd"))

    fun constantDay(date: LocalDate): String = date.format(DateTimeFormatter.ofPattern(DAY_PATTERN))

    fun dynamicDay(date: LocalDate, pattern: String): String = date.format(DateTimeFormatter.ofPattern(pattern))

    fun gson(value: Any): String = Gson().toJson(value)

    fun decode(text: String): Map<String, String> = Json { ignoreUnknownKeys = true }.decodeFromString(text)

    fun words(text: String): List<String> = text.split(Regex("\\s+"))

    fun digits(text: String): Boolean = "\\d+".toRegex().matches(text)

    fun quoted(text: String): Boolean = Pattern.compile("\"[^\"]*\"").matcher(text).matches()

    fun dynamicRegex(text: String, pattern: String): Boolean = Regex(pattern).matches(text)

    fun unmarshal(type: Class<*>, text: String): Any =
        JAXBContext.newInstance(type).createUnmarshaller().unmarshal(java.io.StringReader(text))

    fun cachedContext(type: Class<*>): JAXBContext = contexts.getOrPut(type) { JAXBContext.newInstance(type) }

    fun mapper(): ObjectMapper {
        val current = lazyMapper ?: ObjectMapper()
        lazyMapper = current
        return current
    }

    fun lazyInit(): ObjectMapper {
        if (lazyMapper == null) {
            lazyMapper = ObjectMapper()
        }
        return lazyMapper!!
    }

    fun factory(): ObjectMapper = ObjectMapper().findAndRegisterModules()

    @PostConstruct
    fun start() {
        started = jacksonObjectMapper()
        warm()
    }

    private fun warm() {
        lazyMapper = ObjectMapper()
    }

    companion object {
        val COMPANION = ObjectMapper()

        fun shared(value: Any): String = ObjectMapper().writeValueAsString(value)
    }
}

fun main() {
    println(ObjectMapper().writeValueAsString(SHARED))
}
