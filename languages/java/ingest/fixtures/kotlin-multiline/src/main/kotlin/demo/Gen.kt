package demo

import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking

class Repo {
    suspend fun find(id: Int): String? = if (id == 1) "x" else null
}

fun sumFlow(): Int = runBlocking {
    var total = 0
    flowOf(1, 2).collect { value -> total += value }
    total
}

fun labelFlow(): List<String> = runBlocking {
    flow {
        emit("in progress")
        emit("done")
    }.toList()
}

fun viaRepo(repo: Repo, id: Int): String = runBlocking {
    val name = repo.find(id) ?: "unknown"
    name
}

suspend fun named(repo: Repo, id: Int): String {
    val name = repo.find(id) ?: "unknown"
    return name
}
