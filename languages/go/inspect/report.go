package main

type Report struct {
	Files     []File     `json:"files"`
	Functions []Function `json:"functions"`
	Types     []Type     `json:"types"`
	Tests     []Test     `json:"tests"`
	Branches  []Branch   `json:"branches"`
	Errors    []string   `json:"errors"`
}

type Position struct {
	Line   int `json:"line"`
	Column int `json:"column"`
}

type Arm struct {
	Label       string    `json:"label"`
	From        Position  `json:"from"`
	To          Position  `json:"to"`
	Fallthrough *Position `json:"fallthrough,omitempty"`
}

type Branch struct {
	File     string   `json:"file"`
	Function string   `json:"function"`
	Kind     string   `json:"kind"`
	At       Position `json:"at"`
	Arms     []Arm    `json:"arms"`
	Implicit string   `json:"implicit,omitempty"`
}

type File struct {
	Path      string `json:"path"`
	Package   string `json:"package"`
	Test      bool   `json:"test"`
	Generated bool   `json:"generated"`
}

type Function struct {
	File              string   `json:"file"`
	Name              string   `json:"name"`
	Start             int      `json:"start"`
	End               int      `json:"end"`
	Lines             int      `json:"lines"`
	Statements        int      `json:"statements"`
	MaxControlNesting int      `json:"maxControlNesting"`
	Parameters        int      `json:"parameters"`
	Complexity        int      `json:"complexity"`
	Body              Position `json:"body"`
	Close             Position `json:"close"`
	Branches          []Branch `json:"-"`
}

type Type struct {
	File    string `json:"file"`
	Name    string `json:"name"`
	Kind    string `json:"kind"`
	Start   int    `json:"start"`
	End     int    `json:"end"`
	Methods int    `json:"methods"`
	Fields  int    `json:"fields"`
}

type Test struct {
	Function
	ShortSkip bool `json:"shortSkip"`
}
