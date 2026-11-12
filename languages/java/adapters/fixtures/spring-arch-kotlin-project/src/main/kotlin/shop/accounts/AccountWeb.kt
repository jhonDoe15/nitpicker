package shop.accounts

import io.micronaut.http.HttpResponse
import io.micronaut.http.annotation.Controller
import io.vertx.ext.web.RoutingContext
import jakarta.ws.rs.Path
import jakarta.ws.rs.core.Response
import java.sql.ResultSet
import javax.sql.DataSource
import org.springframework.http.RequestEntity
import org.springframework.http.ResponseEntity
import org.springframework.web.reactive.function.server.ServerRequest
import org.springframework.web.reactive.function.server.ServerResponse
import reactor.core.publisher.Mono

@Path("/accounts")
class AccountResource {
    fun list(): Response? = null

    fun export(): ResultSet? = null
}

@Controller("/accounts")
class AccountEndpoint {
    fun show(id: Long): HttpResponse<AccountView>? = null
}

class AccountRoutes {
    fun list(context: RoutingContext) {}
}

class AccountHandler {
    fun list(request: ServerRequest): Mono<ServerResponse> = Mono.empty()

    fun view(): ResponseEntity<AccountView>? = null
}

class PartnerClient {
    fun charge(request: RequestEntity<AccountView>): ResponseEntity<String>? = null
}

class AccountLookup(private val source: DataSource) {
    fun find(id: Long): AccountView = AccountView(id, source.toString())

    companion object {
        fun over(source: DataSource): AccountLookup = AccountLookup(source)
    }
}
