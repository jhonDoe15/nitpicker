package copypasted

func Total(price int, currency string) int {
	if currency == "EUR" {
		return price + price/5
	}
	return price
}

func Net(price int, _ string) int {
	return price
}
