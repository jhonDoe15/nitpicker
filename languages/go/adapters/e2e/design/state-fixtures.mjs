export const BASE_FILES = {
  'go.mod': 'module shop\n\ngo 1.22\n',
  'nitpicker.config.json': '{ "preset": "go", "disable": ["mutation"] }\n',
  'cmd/shop/main.go': `package main

import (
	"fmt"

	"shop/internal/orders"
)

func main() {
	cart := orders.NewCart()
	fmt.Println(len(cart.Lines()))
}
`,
  'internal/orders/cart.go': `package orders

type Cart struct {
	items []string
}

func NewCart() *Cart {
	return &Cart{items: []string{"tea"}}
}

func (c *Cart) Lines() []string {
	return c.items
}

func (c *Cart) Snapshot() []string {
	return append([]string(nil), c.items...)
}
`,
};

const MAIN_WITH_PAY = BASE_FILES['cmd/shop/main.go']
  .replace('"shop/internal/orders"', '"shop/internal/checkout"\n\t"shop/internal/orders"')
  .replace(
    'fmt.Println(len(cart.Lines()))',
    'checkout.Pay(cart)\n\tfmt.Println(len(cart.Lines()))',
  );

export const ESCAPING_FILES = {
  'cmd/shop/main.go': MAIN_WITH_PAY,
  'internal/checkout/pay.go': `package checkout

import "shop/internal/orders"

func Pay(cart *orders.Cart) {
	lines := cart.Lines()
	lines[0] = "free"
}
`,
};

export const COPYING_FILES = {
  'cmd/shop/main.go': MAIN_WITH_PAY,
  'internal/checkout/pay.go': `package checkout

import "shop/internal/orders"

func Pay(cart *orders.Cart) {
	lines := cart.Snapshot()
	lines[0] = "free"
	_ = append(cart.Lines(), "extra")
}
`,
};
