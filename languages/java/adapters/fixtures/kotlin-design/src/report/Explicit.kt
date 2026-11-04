package report

import billing.Cart
import shop.Cart as ShopCart

fun explicit(cart: Cart): Int = cart.total()

fun aliased(cart: ShopCart): Int = cart.total()

fun overloaded(cart: Cart, sku: String): Int = cart.price(sku)

fun literalOverload(cart: Cart): Int = cart.price("x") + cart.price(1)

fun unknownArgument(cart: Cart, any: Any): Int = cart.price(any.hashCode())
