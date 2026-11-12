import AppIntents
import Foundation

/// Apre l'app direttamente sul nuovo movimento. Usato dal Centro di Controllo, dalla schermata di blocco e dal tasto Azione.
@available(iOS 18.0, *)
struct OpenQuickAddIntent: AppIntent {
    static let title: LocalizedStringResource = "Nuovo movimento"
    static let description = IntentDescription("Apre Soldi sul nuovo movimento.")

    func perform() async throws -> some IntentResult & OpensIntent {
        .result(opensIntent: OpenURLIntent(URL(string: "soldi://nuovo")!))
    }
}
