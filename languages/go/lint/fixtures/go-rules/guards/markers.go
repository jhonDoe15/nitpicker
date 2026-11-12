package guards

// TODO: split the pricing rules out. // want todo-without-issue

// TODO(#12): move the tax table to configuration.

// FIXME(PRICE-9) round half to even.

// TODO(someone): cache the totals. // want todo-without-issue

// The steps are listed in TODO.md and the HACKING guide; éTODO is a word.

/*
Total adds the line prices.
HACK: skips the discount table. // want todo-without-issue
*/
func Total(prices []int) int {
	sum := 0
	for _, price := range prices {
		sum += price
	}
	return sum
}

func Stamp() string {
	// XXX: RFC-3339 only. // want todo-without-issue
	return "2006-01-02 15:04"
}
