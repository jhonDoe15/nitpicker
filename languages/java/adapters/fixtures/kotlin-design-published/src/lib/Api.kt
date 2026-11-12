package lib

class Client(val timeout: Int, val region: String) {
    fun connect(): String = "$region/$timeout"
}

data class Settings(val timeout: Int, val region: String)

enum class Mode { FAST, SAFE }

interface Transport {
    fun send(payload: String): Int
}

internal class Pool(val size: Int) {
    fun grow(): Int = size + 1
}

private class Secret(val key: String) {
    fun reveal(): String = key
}

fun open(settings: Settings): Client = Client(settings.timeout, settings.region)

internal fun tune(settings: Settings): Int = settings.timeout + 1

private fun hide(settings: Settings): Int = tune(settings)
