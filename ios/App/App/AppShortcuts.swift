import AppIntents
import Foundation

/// "Ehi Siri, aggiungi una spesa in Soldi": Siri chiede l'importo e apre l'app con il movimento già compilato.
@available(iOS 18.0, *)
struct AddExpenseIntent: AppIntent {
    static let title: LocalizedStringResource = "Aggiungi una spesa"
    static let description = IntentDescription("Registra una spesa in Soldi.")

    @Parameter(title: "Importo", requestValueDialog: "Quanto hai speso?")
    var amount: Double

    @Parameter(title: "Descrizione", requestValueDialog: "Per cosa?")
    var note: String?

    static var parameterSummary: some ParameterSummary {
        Summary("Aggiungi una spesa di \(\.$amount) per \(\.$note)")
    }

    func perform() async throws -> some IntentResult & OpensIntent {
        var c = URLComponents()
        c.scheme = "soldi"
        c.host = "nuovo"
        c.queryItems = [URLQueryItem(name: "importo", value: String(amount))]
        if let note, !note.isEmpty { c.queryItems?.append(URLQueryItem(name: "descrizione", value: note)) }
        return .result(opensIntent: OpenURLIntent(c.url!))
    }
}

@available(iOS 18.0, *)
struct SoldiShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AddExpenseIntent(),
            phrases: [
                "Aggiungi una spesa in \(.applicationName)",
                "Nuova spesa su \(.applicationName)",
                "Registra una spesa con \(.applicationName)",
            ],
            shortTitle: "Aggiungi spesa",
            systemImageName: "plus.circle.fill"
        )
        AppShortcut(
            intent: OpenQuickAddIntent(),
            phrases: ["Apri nuovo movimento in \(.applicationName)"],
            shortTitle: "Nuovo movimento",
            systemImageName: "square.and.pencil"
        )
    }
}
