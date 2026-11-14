const GO_MOD = 'module example.com/shop\n\ngo 1.22\n';
const CONFIG = '{ "preset": "go", "disable": ["mutation"] }\n';

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

func Discount(price, percent int) int {
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

func Grade(score, bonus int) string {
	if score > 0 {
		for i := range bonus {
			if score+i > 90 {
				return "A"
			}
		}
	}
	return "B"
}
`;

export const NESTED_TEST = `package shop

import "testing"

func TestGrade(t *testing.T) {
	if Grade(95, 1) != "A" || Grade(10, 1) != "B" || Grade(-1, 0) != "B" {
		t.Fatal("wrong grade")
	}
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

function sleepingTest(header, name, seconds, guard = '') {
  const helper = name.replace('Test', 'restock');
  return `${header}package shop

import (
	"testing"
	"time"
)

func ${name}(t *testing.T) {
${guard}	if got := ${helper}(); got != 1 {
		t.Fatalf("${helper}() = %d, want 1", got)
	}
}

func ${helper}() int {
	time.Sleep(${String(seconds)} * time.Second)
	return Total([]int{1})
}
`;
}

export const SLOW_TEST = sleepingTest('', 'TestSlow', 6);
export const SLOW_INTEGRATION_TEST = sleepingTest(
  '//go:build integration\n\n',
  'TestSlowIntegration',
  6,
);
export const SHORT_SKIPPED_TEST = sleepingTest(
  '',
  'TestSlowSkipped',
  6,
  '\tif testing.Short() {\n\t\tt.Skip("integration")\n\t}\n',
);
export const SHORT_LOGGED_TEST = sleepingTest(
  '',
  'TestSlowLogged',
  6,
  '\tif testing.Short() {\n\t\tt.Log("short")\n\t}\n',
);
export const SHORT_DISCARDED_TEST = sleepingTest(
  '',
  'TestSlowDiscarded',
  6,
  '\t_ = testing.Short()\n',
);

export const GOFUMPT_ONLY = `package shop

func Rounded(value int) int {

	return value / 10 * 10
}
`;

export const DISCOUNT_HALF_TEST = `package shop

import "testing"

func TestDiscount(t *testing.T) {
	if Discount(200, 10) != 180 {
		t.Fatal("wrong discount")
	}
}
`;

export const UNTESTED_LEGACY = `package shop

func Fee(weight int) int {
	if weight > 10 {
		return 5
	}
	return 1
}
`;

export const BRANCHY = `package shop

func Size(weight int) string {
	switch {
	case weight > 100:
		return "huge"
	case weight > 50:
		return "large"
	case weight > 10:
		return "medium"
	case weight > 0:
		return "small"
	}
	return "none"
}
`;

export const DISCOUNT_PANIC_TEST = `package shop

import "testing"

func TestDiscount(t *testing.T) {
	if Discount(200, 10) != 180 || Discount(200, 0) != 200 {
		t.Fatal("wrong discount")
	}
	panic("crashed after the checks")
}
`;

export function twice(result) {
  return `package shop

func Twice(x, flag bool) int {
	if x {
		x = flag
	}
	if x {
		return 2
	}
	return ${String(result)}
}
`;
}

export function twiceTest(...calls) {
  const checks = calls.map((call) => `\tif Twice(${call}) < 0 {\n\t\tt.Fatal("negative")\n\t}\n`);
  return `package shop

import "testing"

func TestTwice(t *testing.T) {
${checks.join('')}}
`;
}
