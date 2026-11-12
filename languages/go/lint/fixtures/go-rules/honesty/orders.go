package honesty

import "errors"

var errEmpty = errors.New("empty order")

type Order struct {
	Lines []int
}

func Total(order Order) (int, error) {
	if len(order.Lines) == 0 {
		return 0, errEmpty
	}
	sum := 0
	for _, line := range order.Lines {
		sum += line
	}
	return sum, nil
}

func Find(orders []Order, size int) *Order {
	for index := range orders {
		if len(orders[index].Lines) == size {
			return &orders[index]
		}
	}
	return nil
}
