package overflow

import "math"

func Between(text string, start, width int) bool {
	return width >= len(text)-start
}

func Widened(text string, start, width int) bool {
	return int64(start)+int64(width) < int64(len(text))
}

func Checked(text string, start, width int) int {
	if width == math.MaxInt {
		return len(text)
	}
	return min(start+width, len(text))
}

func Clamped(text string, start, width int) int {
	return min(start+min(width, len(text)), len(text))
}

func Unbounded(text string) int {
	return Checked(text, 0, math.MaxInt)
}

func Ordinary(items []string, offset, limit int) []string {
	return items[offset : offset+limit]
}

func Sum(left, right int) int {
	return left + right
}

func Total(prices []int) int {
	total := 0
	for _, price := range prices {
		total += price
	}
	return total
}

func Bounded(text string, start, width int) int {
	if width >= len(text)-start {
		return len(text)
	}
	return min(start+width, len(text))
}

func WholeBounded(text string) int {
	return Bounded(text, 0, math.MaxInt)
}
