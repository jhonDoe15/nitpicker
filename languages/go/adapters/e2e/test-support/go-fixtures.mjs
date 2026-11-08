const GO_MOD = 'module example.com/shop\n\ngo 1.22\n';
const CONFIG = '{ "preset": "go" }\n';

const PRICE = `package shop

func Total(prices []int) int {
	total := 0
	for _, price := range prices {
		total += price
	}
	return total
}
`;

const PRICE_TEST = `package shop

import "testing"

func TestTotal(t *testing.T) {
	if Total([]int{1, 2}) != 3 {
		t.Fatal("wrong total")
	}
}
`;

const LEGACY = `package shop

func Legacy(a, b, c, d int) int {
	return a + b + c + d
}
`;

export const BASE_FILES = {
  'go.mod': GO_MOD,
  'nitpicker.config.json': CONFIG,
  'shop/price.go': PRICE,
  'shop/price_test.go': PRICE_TEST,
  'shop/legacy.go': LEGACY,
};

export const DISCOUNT = `package shop

func Discount(price int, percent int) int {
	if percent <= 0 {
		return price
	}
	return price - price*percent/100
}
`;

export const DISCOUNT_TEST = `package shop

import "testing"

func TestDiscount(t *testing.T) {
	if Discount(200, 10) != 180 || Discount(5, 0) != 5 {
		t.Fatal("wrong discount")
	}
}
`;

export const UNFORMATTED = `package shop

func Shipping(weight int) int {
  return weight * 2
}
`;

export const PRINTF = `package shop

import "fmt"

func Label(count int) string {
	return fmt.Sprintf("%s items", count)
}
`;

export const BROKEN = `package shop

func Broken() int {
	return missing
}
`;

export const NESTED = `package shop

func Grade(score int, bonus int) string {
	if score > 0 {
		for i := 0; i < bonus; i++ {
			if score+i > 90 {
				return "A"
			}
		}
	}
	return "B"
}
`;

export const LEGACY_TOUCHED = `package shop

func Legacy(a, b, c, d int) int {
	return a + b + c + d + 0
}
`;

export const FAILING_TEST = `package shop

import "testing"

func TestBroken(t *testing.T) {
	t.Fatal("still broken")
}
`;

function sleepingTest(header, name, seconds) {
  return `${header}package shop

import (
	"testing"
	"time"
)

func ${name}(t *testing.T) {
	time.Sleep(${String(seconds)} * time.Second)
}
`;
}

export const SLOW_TEST = sleepingTest('', 'TestSlow', 6);
export const SLOW_INTEGRATION_TEST = sleepingTest(
  '//go:build integration\n\n',
  'TestSlowIntegration',
  6,
);

export const GOFUMPT_ONLY = `package shop

func Rounded(value int) int {

	return value / 10 * 10
}
`;
