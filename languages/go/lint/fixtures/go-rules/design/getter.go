package design

import "fixtures/go-rules/contract"

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

func (order Order) GetOrDefault() int {
	if order.total == 0 {
		return 1
	}
	return order.total
}

func (order Order) Getaway() string {
	return order.owner
}

func (order Order) GetTotal() (int, bool) {
	return order.total, order.total > 0
}

type Account struct {
	owner string
}

func (account Account) GetName() string {
	return account.owner
}

var _ contract.Owned = Account{}

type ledger struct {
	owner string
}

func (entry ledger) GetOwner() string {
	return entry.owner
}

func Ledger(owner string) string {
	return ledger{owner: owner}.GetOwner()
}
