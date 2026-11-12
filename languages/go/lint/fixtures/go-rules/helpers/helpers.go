package helpers

func Clamp(value, low, high int) int {
	return min(max(value, low), high)
}
