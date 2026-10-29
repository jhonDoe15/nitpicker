package shop.bad

import jakarta.validation.Valid
import jakarta.validation.constraints.*

data class Address(@NotBlank val city: String)

data class SignupRequest(
    @Email val email: String,
    @param:Size(max = 40) val name: String,
    @Valid val address: Address,
)
