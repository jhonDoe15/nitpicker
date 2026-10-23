package shop.carts

import org.springframework.context.annotation.Scope
import org.springframework.stereotype.Component
import org.springframework.web.context.annotation.RequestScope

@Component
@RequestScope
class Cart

@Component
@Scope("request")
class Basket
