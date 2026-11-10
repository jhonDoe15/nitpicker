package stylecheck

// A thing that holds an amount.
type Amount struct { // want-above ST1021
	Value int
}

// Price is an amount with a currency.
type Price struct {
	Value    int
	Currency string
}
