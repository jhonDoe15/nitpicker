package main

type Report struct {
	Files     []File     `json:"files"`
	Functions []Function `json:"functions"`
	Types     []Type     `json:"types"`
	Tests     []Function `json:"tests"`
	Errors    []string   `json:"errors"`
}

type File struct {
	Path      string `json:"path"`
	Package   string `json:"package"`
	Test      bool   `json:"test"`
	Generated bool   `json:"generated"`
}

type Function struct {
	File              string `json:"file"`
	Name              string `json:"name"`
	Start             int    `json:"start"`
	End               int    `json:"end"`
	Lines             int    `json:"lines"`
	Statements        int    `json:"statements"`
	MaxControlNesting int    `json:"maxControlNesting"`
	Parameters        int    `json:"parameters"`
	Complexity        int    `json:"complexity"`
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
