package com.example.library.app

fun execute(
    args: List<String>,
    writer: Writer,
) {
    when (args.firstOrNull()) {
        "catalog" -> catalogMain(writer)
        "loans" -> loansMain(args[1], writer)
        "member" -> memberLoansMain(args[1], args[2], writer)
        "overdue" -> overdueReportMain(args[1], writer)
        else -> writer.write("Unknown command\n")
    }
}

fun main(args: Array<String>) {
    execute(args.toList(), Writer { System.out.print(it) })
}
