import WidgetKit
import SwiftUI

// Dati scritti dall'app (WidgetBridge) nel gruppo condiviso
private let appGroup = "group.com.phoenix0102.soldi"

struct SoldiData: Codable {
    var networth: Double
    var delta: Double
    var monthExpense: Double
    var monthIncome: Double
    var budgetSpent: Double
    var budgetTotal: Double
    var month: String
    var updatedAt: String

    static let sample = SoldiData(networth: 12480, delta: 320, monthExpense: 840, monthIncome: 1850, budgetSpent: 410, budgetTotal: 570, month: "Novembre", updatedAt: "")

    static func load() -> SoldiData? {
        guard let raw = UserDefaults(suiteName: appGroup)?.string(forKey: "widget"), let data = raw.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(SoldiData.self, from: data)
    }
}

struct SoldiEntry: TimelineEntry {
    let date: Date
    let data: SoldiData?
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> SoldiEntry { SoldiEntry(date: .now, data: .sample) }
    func getSnapshot(in context: Context, completion: @escaping (SoldiEntry) -> Void) {
        completion(SoldiEntry(date: .now, data: context.isPreview ? .sample : (SoldiData.load() ?? .sample)))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<SoldiEntry>) -> Void) {
        // L'app aggiorna il widget quando cambiano i dati; in più ricontrolla ogni ora
        completion(Timeline(entries: [SoldiEntry(date: .now, data: SoldiData.load())], policy: .after(.now.addingTimeInterval(3600))))
    }
}

// MARK: - Stile

private extension Color {
    static let note = Color(red: 15 / 255, green: 77 / 255, blue: 58 / 255)
    static let noteDark = Color(red: 10 / 255, green: 52 / 255, blue: 40 / 255)
    static let noteInk = Color(red: 233 / 255, green: 242 / 255, blue: 237 / 255)
    static let mint = Color(red: 111 / 255, green: 211 / 255, blue: 168 / 255)
    static let warn = Color(red: 255 / 255, green: 196 / 255, blue: 120 / 255)
}

private func euro(_ v: Double, decimals: Bool = false) -> String {
    let f = NumberFormatter()
    f.numberStyle = .currency
    f.locale = Locale(identifier: "it_IT")
    f.currencyCode = "EUR"
    f.maximumFractionDigits = decimals ? 2 : 0
    f.minimumFractionDigits = decimals ? 2 : 0
    return f.string(from: NSNumber(value: v)) ?? "\(Int(v)) €"
}

private struct Background: View {
    var body: some View {
        ZStack {
            LinearGradient(colors: [.note, .noteDark], startPoint: .topLeading, endPoint: .bottomTrailing)
            Circle().stroke(Color.noteInk.opacity(0.08), lineWidth: 1).frame(width: 220, height: 220).offset(x: 70, y: -70)
            Circle().stroke(Color.noteInk.opacity(0.06), lineWidth: 1).frame(width: 160, height: 160).offset(x: 70, y: -70)
        }
    }
}

private struct Delta: View {
    let value: Double
    var body: some View {
        HStack(spacing: 3) {
            Image(systemName: value >= 0 ? "arrow.up.right" : "arrow.down.right").font(.system(size: 9, weight: .bold))
            Text(euro(abs(value))).font(.system(size: 11, weight: .semibold)).monospacedDigit()
        }
        .padding(.horizontal, 7).padding(.vertical, 3)
        .background(Capsule().fill((value >= 0 ? Color.mint : Color.warn).opacity(0.22)))
        .foregroundStyle(value >= 0 ? Color.mint : Color.warn)
    }
}

private struct BudgetBar: View {
    let spent: Double
    let total: Double
    var body: some View {
        let p = total > 0 ? min(1, spent / total) : 0
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.noteInk.opacity(0.15))
                Capsule().fill(p >= 1 ? Color.warn : Color.mint).frame(width: max(6, g.size.width * p))
            }
        }
        .frame(height: 6)
    }
}

// MARK: - Viste

struct SmallView: View {
    let d: SoldiData
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Patrimonio").font(.system(size: 12, weight: .medium)).foregroundStyle(Color.noteInk.opacity(0.75))
            Text(euro(d.networth)).font(.system(size: 26, weight: .semibold, design: .default)).monospacedDigit()
                .minimumScaleFactor(0.6).lineLimit(1).foregroundStyle(Color.noteInk).privacySensitive()
            Delta(value: d.delta).privacySensitive()
            Spacer(minLength: 0)
            VStack(alignment: .leading, spacing: 4) {
                Text("Spese di \(d.month.lowercased())").font(.system(size: 10, weight: .medium)).foregroundStyle(Color.noteInk.opacity(0.7))
                Text(euro(d.monthExpense)).font(.system(size: 13, weight: .semibold)).monospacedDigit().foregroundStyle(Color.noteInk).privacySensitive()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct MediumView: View {
    let d: SoldiData
    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Patrimonio netto").font(.system(size: 12, weight: .medium)).foregroundStyle(Color.noteInk.opacity(0.75))
                Text(euro(d.networth)).font(.system(size: 30, weight: .semibold)).monospacedDigit()
                    .minimumScaleFactor(0.6).lineLimit(1).foregroundStyle(Color.noteInk).privacySensitive()
                Delta(value: d.delta).privacySensitive()
                Spacer(minLength: 0)
                Text("da fine mese scorso").font(.system(size: 10)).foregroundStyle(Color.noteInk.opacity(0.6))
            }
            Rectangle().fill(Color.noteInk.opacity(0.15)).frame(width: 1)
            VStack(alignment: .leading, spacing: 8) {
                Text(d.month).font(.system(size: 12, weight: .medium)).foregroundStyle(Color.noteInk.opacity(0.75))
                Row(label: "Uscite", value: d.monthExpense)
                Row(label: "Entrate", value: d.monthIncome)
                if d.budgetTotal > 0 {
                    VStack(alignment: .leading, spacing: 4) {
                        BudgetBar(spent: d.budgetSpent, total: d.budgetTotal)
                        Text("Budget \(euro(d.budgetSpent)) di \(euro(d.budgetTotal))").font(.system(size: 10)).foregroundStyle(Color.noteInk.opacity(0.7)).lineLimit(1).minimumScaleFactor(0.8)
                    }
                    .privacySensitive()
                }
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private struct Row: View {
        let label: String
        let value: Double
        var body: some View {
            HStack {
                Text(label).font(.system(size: 12)).foregroundStyle(Color.noteInk.opacity(0.75))
                Spacer()
                Text(euro(value)).font(.system(size: 13, weight: .semibold)).monospacedDigit().foregroundStyle(Color.noteInk).privacySensitive()
            }
        }
    }
}

struct EmptyStateView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Soldi").font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.noteInk)
            Text("Apri l'app una volta per vedere qui il tuo patrimonio.").font(.system(size: 12)).foregroundStyle(Color.noteInk.opacity(0.75))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct LockRectView: View {
    let d: SoldiData
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text("Patrimonio").font(.system(size: 11, weight: .medium)).widgetAccentable()
            Text(euro(d.networth)).font(.system(size: 17, weight: .semibold)).monospacedDigit().privacySensitive()
            Text("Spese mese \(euro(d.monthExpense))").font(.system(size: 11)).privacySensitive()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct SoldiWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: SoldiEntry
    var body: some View {
        Group {
            if let d = entry.data {
                switch family {
                case .systemMedium: MediumView(d: d)
                case .accessoryRectangular: LockRectView(d: d)
                case .accessoryInline: Text("Patrimonio \(euro(d.networth))").privacySensitive()
                default: SmallView(d: d)
                }
            } else {
                EmptyStateView()
            }
        }
        .widgetURL(URL(string: "soldi://patrimonio"))
        .containerBackground(for: .widget) {
            if family == .systemSmall || family == .systemMedium { Background() } else { Color.clear }
        }
    }
}

struct SoldiWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SoldiWidget", provider: Provider()) { entry in
            SoldiWidgetView(entry: entry)
        }
        .configurationDisplayName("Patrimonio")
        .description("Patrimonio netto e spese del mese.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline])
    }
}

@main
struct SoldiWidgetBundle: WidgetBundle {
    var body: some Widget { SoldiWidget() }
}
