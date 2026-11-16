package overflow

import "math"

const Unlimited = math.MaxInt

func Window(text string, start, width int) string {
	end := min(start+width, len(text)) // want max-value-overflow
	return text[start:end]
}

func WholeText(text string) string {
	return Window(text, 0, Unlimited)
}

func Page(items []string, offset, limit int) []string {
	end := offset + limit // want max-value-overflow
	return items[offset:min(end, len(items))]
}

func AllItems(items []string) []string {
	return Page(items, 0, math.MaxInt)
}

func Slice(items []string, offset, limit int) []string {
	return items[offset : offset+limit] // want max-value-overflow
}

func Everything(items []string) []string {
	return Slice(items, 0, Unlimited)
}

func Narrow(left, right int32) bool {
	return left+right > 0 // want max-value-overflow
}

func Widest() bool {
	return Narrow(1, math.MaxInt32)
}

type Query struct {
	Limit int64
}

func Run(items []string) bool {
	query := Query{Limit: math.MaxInt64}
	total := int64(len(items))
	return total+query.Limit > 10 // want max-value-overflow
}

func Extend(items []string, offset int) []string {
	limit := Unlimited
	limit += offset // want max-value-overflow
	return items[:min(limit, len(items))]
}

func Signed(text string, start, width int) int {
	if width < 0 {
		return 0
	}
	return min(start+width, len(text)) // want max-value-overflow
}

func WholeSigned(text string) int {
	return Signed(text, 0, Unlimited)
}
