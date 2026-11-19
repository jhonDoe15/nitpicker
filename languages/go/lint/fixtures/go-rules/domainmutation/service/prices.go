package service

func WithTax(prices []int, rate int) []int {
	return append(prices, rate)
}
