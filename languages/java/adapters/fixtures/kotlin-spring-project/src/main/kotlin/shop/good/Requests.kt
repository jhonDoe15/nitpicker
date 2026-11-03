package shop.good

import jakarta.validation.Valid
import jakarta.validation.constraints.Email
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size

data class Address(@field:NotBlank val city: String)

data class SignupRequest(
    @field:Email val email: String,
    @get:Size(max = 40) val name: String,
    @field:Valid val address: Address,
    @field:[NotBlank Size(max = 20)] val nickname: String,
    val note: String = "",
)
