package design

type Order struct {
	owner string
	total int
}

func (order Order) GetOwner() string { // want get-prefixed-getter
	return order.owner
}

func (order Order) Total() int {
	return order.total
}

func (order Order) GetDiscount(code string) int {
	if code == order.owner {
		return order.total / 10
	}
	return 0
}
