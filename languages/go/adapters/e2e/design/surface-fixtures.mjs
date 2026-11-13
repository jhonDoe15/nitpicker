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
