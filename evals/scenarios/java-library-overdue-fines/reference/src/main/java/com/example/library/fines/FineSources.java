package com.example.library.fines;

import com.example.library.catalog.Catalog;
import com.example.library.loans.LoanRepository;
import com.example.library.members.Directory;

/** Where the fines of the library are read from. */
public record FineSources(Catalog catalog, Directory members, LoanRepository loans) {}
