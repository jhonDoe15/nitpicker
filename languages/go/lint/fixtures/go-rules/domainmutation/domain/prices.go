package domain

import (
	"maps"
	"slices"
	"sort"
)

func WithTax(prices []int, rate int) []int {
	return append(prices, rate) // want mutating-method-in-domain
}

func Ordered(prices []int) []int {
	sort.Ints(prices) // want mutating-method-in-domain
	return prices
}

func OrderedFunc(names []string) []string {
	slices.SortFunc(names, func(left, right string) int { return len(left) - len(right) }) // want mutating-method-in-domain
	return names
}

func Renamed(table map[string]int, name string) map[string]int {
	table[name] = 1 // want mutating-method-in-domain
	return table
}

func Dropped(table map[string]int, name string) {
	delete(table, name) // want mutating-method-in-domain
}

func Reversed(prices []int) {
	slices.Reverse(prices) // want mutating-method-in-domain
}

func Cloned(prices []int, rate int) []int {
	return append(slices.Clone(prices), rate)
}

func Sorted(prices []int) []int {
	copied := slices.Clone(prices)
	sort.Ints(copied)
	return copied
}

func Replaced(prices []int, rate int) []int {
	prices = slices.Clone(prices)
	prices = append(prices, rate)
	return prices
}

func Merged(table map[string]int, name string) map[string]int {
	result := maps.Clone(table)
	result[name] = 1
	return result
}

func Built(prices []int) []int {
	result := make([]int, 0, len(prices))
	for _, price := range prices {
		result = append(result, price*2)
	}
	sort.Ints(result)
	return result
}

func Counted(words []string) map[string]int {
	counts := map[string]int{}
	for _, word := range words {
		counts[word]++
	}
	return counts
}

func Read(prices []int, table map[string]int) int {
	return len(prices) + table["a"]
}

func Scaled(prices []int) {
	prices[0] = 1 // want mutating-method-in-domain
}

func Doubled(prices []int) {
	prices[1] *= 2 // want mutating-method-in-domain
}

func Overwritten(prices, source []int) {
	copy(prices, source) // want mutating-method-in-domain
}

func CopiedFrom(prices []int) []int {
	result := make([]int, len(prices))
	copy(result, prices)
	result[0] = 1
	return result
}
