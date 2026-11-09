package sa4

import "math/rand/v2"

func Always() int {
	return rand.IntN(1) // want SA4030
}

func Dice() int {
	return rand.IntN(6) + 1
}
