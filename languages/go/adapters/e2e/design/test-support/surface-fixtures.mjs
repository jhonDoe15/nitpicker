const STORE = `package store

type Order struct {
	ID string
}

func Load(id string, limit int) Order {
	return Order{ID: id[:limit]}
}
`;

const API = `package api

import (
	"shop/internal/service"
	"shop/internal/store"
)

func Get(id string, limit int) store.Order {
	return service.Find(id, limit)
}
`;

function service(call) {
  return `package service

import "shop/internal/store"

func Find(id string, limit int) store.Order {
	return ${call}
}
`;
}

export const FORWARDING_FILES = {
  'internal/store/orders.go': STORE,
  'internal/service/orders.go': service('store.Load(id, limit)'),
  'internal/api/orders.go': API,
};

export const OWNING_HOP_FILES = {
  'internal/store/orders.go': STORE,
  'internal/service/orders.go': service('store.Load(id, 10)'),
  'internal/api/orders.go': API,
};

const LEDGER = `package ledger

type Ledger struct {
	readings []int
	writes   []int
}

func (l *Ledger) ReadFirst() int {
	return l.readings[0]
}

func (l *Ledger) ReadLast() int {
	return l.readings[len(l.readings)-1]
}

func (l *Ledger) WriteOne(value int) {
	l.writes = append(l.writes, value)
}

func (l *Ledger) WriteTwo(value int) {
	l.writes = append(l.writes, value, value)
}
`;

const REPORTS = `package reports

import "shop/internal/ledger"

func Render(l *ledger.Ledger) int {
	return l.ReadFirst() + l.ReadLast()
}
`;

export const DISJOINT_FILES = {
  'internal/ledger/ledger.go': LEDGER,
  'internal/reports/render.go': REPORTS,
  'internal/imports/load.go': `package imports

import "shop/internal/ledger"

func Load(l *ledger.Ledger) {
	l.WriteOne(1)
	l.WriteTwo(2)
}
`,
};

export const SHARED_CALLER_FILES = {
  'internal/ledger/ledger.go': LEDGER,
  'internal/reports/render.go': REPORTS,
  'internal/imports/load.go': `package imports

import "shop/internal/ledger"

func Load(l *ledger.Ledger) {
	l.WriteOne(l.ReadFirst())
	l.WriteTwo(2)
}
`,
};

function endpoint(path, name, params) {
  const [, directory] = path.split('/').toReversed();
  return {
    [`internal/${path}`]: `package ${directory}

func ${name}(${params}) {}
`,
  };
}

const ENDPOINT_PARAMS = 'host string, port int, secure bool';

export const CLUMP_FILES = {
  ...endpoint('net/connect.go', 'Connect', ENDPOINT_PARAMS),
  ...endpoint('web/serve.go', 'Serve', ENDPOINT_PARAMS),
  ...endpoint('cli/dial.go', 'Dial', ENDPOINT_PARAMS),
};

export const NO_CLUMP_FILES = {
  ...endpoint('net/connect.go', 'Connect', ENDPOINT_PARAMS),
  ...endpoint('web/serve.go', 'Serve', ENDPOINT_PARAMS),
  ...endpoint('geometry/move.go', 'Move', 'x, y, z float64'),
  ...endpoint('geometry/scale.go', 'Scale', 'x, y, z float64'),
  ...endpoint('physics/push.go', 'Push', 'x, y, z float64'),
};

const METHOD = `package pay

type Method int

const (
	Card Method = iota
	Paypal
	Invoice
	Cash
)
`;

const FEE = `package fees

import "shop/internal/pay"

func Fee(method pay.Method) int {
	switch method {
	case pay.Card, pay.Paypal:
		return 3
	case pay.Invoice:
		return 1
	}
	return 0
}
`;

function audit(condition) {
  return `package audit

import "shop/internal/pay"

func Online(method pay.Method) bool {
	if ${condition} {
		return true
	}
	return false
}
`;
}

export const POLICY_FILES = {
  'internal/pay/method.go': METHOD,
  'internal/fees/fee.go': FEE,
  'internal/audit/online.go': audit('method == pay.Paypal || method == pay.Card'),
};

export const DIFFERENT_POLICY_FILES = {
  'internal/pay/method.go': METHOD,
  'internal/fees/fee.go': FEE,
  'internal/audit/online.go': audit('method == pay.Invoice || method == pay.Cash'),
};
