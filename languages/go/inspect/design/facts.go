package design

import (
	"github.com/jhonDoe15/nitpicker/languages/go/inspect/design/calls"
	"github.com/jhonDoe15/nitpicker/languages/go/inspect/design/uses"
)

type Facts struct {
	Types     []Type     `json:"types"`
	Callables []Callable `json:"callables"`
}

type Field struct {
	Name    string `json:"name"`
	Mutable bool   `json:"mutable,omitempty"`
	Private bool   `json:"private,omitempty"`
}

type Type struct {
	ID         string   `json:"id"`
	File       string   `json:"file"`
	Name       string   `json:"name"`
	Line       int      `json:"line"`
	Kind       string   `json:"kind"`
	Exported   bool     `json:"exported"`
	Fields     []Field  `json:"fields,omitempty"`
	Supertypes []string `json:"supertypes,omitempty"`
	Cases      []string `json:"cases,omitempty"`
}

type Param struct {
	Name     string `json:"name"`
	Type     string `json:"type,omitempty"`
	Variadic bool   `json:"variadic,omitempty"`
}

type Callable struct {
	ID           string          `json:"id"`
	File         string          `json:"file"`
	Name         string          `json:"name"`
	Line         int             `json:"line"`
	Kind         string          `json:"kind"`
	Exported     bool            `json:"exported"`
	Owner        string          `json:"owner,omitempty"`
	Entry        bool            `json:"entry,omitempty"`
	Params       []Param         `json:"params,omitempty"`
	Returns      string          `json:"returns,omitempty"`
	Calls        []calls.Call    `json:"calls,omitempty"`
	ParamUses    []uses.ParamUse `json:"paramUses,omitempty"`
	ReturnsField string          `json:"returnsField,omitempty"`
}
