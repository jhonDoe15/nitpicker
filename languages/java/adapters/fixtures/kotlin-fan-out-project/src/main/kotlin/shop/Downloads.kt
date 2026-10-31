package shop

import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse

val sharedClient: HttpClient = HttpClient.newHttpClient()

fun download(client: HttpClient, url: String): String =
    client.send(HttpRequest.newBuilder(URI.create(url)).build(), HttpResponse.BodyHandlers.ofString()).body()
