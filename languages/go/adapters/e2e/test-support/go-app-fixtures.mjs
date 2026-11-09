const INVOICE = `package billing

import "errors"

func Invoice(lines []int, limit int) (int, error) {
	total := 0
	for index, line := range lines {
		if line < 0 {
			return 0, errors.New("negative line")
		}
		if line > limit {
			total += line * 2
			continue
		}
		if index%2 == 0 {
			total += line + 1
		} else {
			total += line - 1
		}
	}
	if total > 1000 {
		total = 1000
	}
	if total < 10 {
		total = 10
	}
	return total, nil
}
`;

const MAIN = `package main

import (
	"fmt"

	"shop/internal/billing"
)

func main() {
	fmt.Println(billing.Invoice([]int{1, 2}, 5))
}
`;

const INVOICE_TEST = `package billing

import "testing"

func TestInvoice(t *testing.T) {
	if total, err := Invoice([]int{1, 2}, 5); err != nil || total != 10 {
		t.Fatal("wrong invoice")
	}
}
`;

export const APP_FILES = {
  'go.mod': 'module shop\n\ngo 1.22\n',
  'nitpicker.config.json': '{ "preset": "go" }\n',
  'cmd/shop/main.go': MAIN,
  'internal/billing/invoice.go': INVOICE,
  'internal/billing/invoice_test.go': INVOICE_TEST,
};

export const REFUND = INVOICE.replace('func Invoice(lines', 'func Refund(entries')
  .replaceAll('lines', 'entries')
  .replaceAll('line', 'entry')
  .replaceAll('total', 'sum')
  .replace('negative entry', 'negative refund');

export const MAIN_WITH_REFUND = MAIN.replace(
  'fmt.Println(billing.Invoice([]int{1, 2}, 5))',
  'fmt.Println(billing.Invoice([]int{1, 2}, 5))\n\tfmt.Println(billing.Refund([]int{3}, 5))',
);

export const REBATE = `package billing

func Rebate(total int) int {
	return total / 10
}
`;

export const REBATE_TEST = `package billing

import "testing"

func TestRebate(t *testing.T) {
	if Rebate(100) != 10 {
		t.Fatal("wrong rebate")
	}
}
`;

export const ROUNDING = `package billing

func round(total int) int {
	return total / 5 * 5
}
`;

export const ROUNDING_TEST = `package billing

import "testing"

func TestRound(t *testing.T) {
	if round(12) != 10 {
		t.Fatal("wrong rounding")
	}
}
`;
