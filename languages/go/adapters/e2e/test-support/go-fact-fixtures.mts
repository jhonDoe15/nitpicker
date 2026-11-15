const CART = `package cart

func Total(prices []int) int {
	sum := 0
	for _, price := range prices {
		sum += price
	}
	return sum
}
`;

const CART_TEST = `package cart

import "testing"

func TestTotal(t *testing.T) {
	if Total([]int{1, 2}) != 3 {
		t.Fatal("wrong total")
	}
}
`;

const MAIN = `package main

import (
	"fmt"

	"shop/internal/cart"
)

func main() {
	fmt.Println(cart.Total([]int{1, 2}))
}
`;

export const FACT_FILES = {
  'go.mod': 'module shop\n\ngo 1.22\n',
  'nitpicker.config.json': '{ "preset": "go" }\n',
  'cmd/shop/main.go': MAIN,
  'internal/cart/cart.go': CART,
  'internal/cart/cart_test.go': CART_TEST,
};

export const RESTATING_FILES = {
  'internal/cart/cart.go': CART.replace('func Total(', '// Total totals.\nfunc Total('),
};

export const PRINTING_FILES = {
  'internal/cart/cart_test.go': CART_TEST.replace(
    'import "testing"',
    'import (\n\t"fmt"\n\t"log"\n\t"testing"\n)',
  ).replace(
    '\tif Total(',
    '\tfmt.Println("checking the total")\n\tlog.Printf("price list has %d entries", 2)\n\tif Total(',
  ),
};
