import UIKit
import Capacitor
import LocalAuthentication

/// Bridge di Capacitor con i plugin propri dell'app (widget, Face ID).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WidgetBridgePlugin())
        bridge?.registerPluginInstance(SoldiAuthPlugin())
    }
}

/// Face ID / Touch ID scritto qui, senza librerie esterne: stato dettagliato e verifica.
@objc(SoldiAuthPlugin)
public class SoldiAuthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SoldiAuthPlugin"
    public let jsName = "SoldiAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "verify", returnType: CAPPluginReturnPromise),
    ]

    private func kind(_ c: LAContext) -> String {
        switch c.biometryType {
        case .faceID: return "faceid"
        case .touchID: return "touchid"
        default:
            if #available(iOS 17.0, *), c.biometryType == .opticID { return "faceid" }
            return "none"
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        let c = LAContext()
        var err: NSError?
        let ok = c.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &err)
        var problem = ""
        if let e = err {
            let code = LAError.Code(rawValue: e.code)
            if code == .biometryNotEnrolled { problem = "not-enrolled" }
            else if code == .biometryLockout { problem = "lockout" }
            else if code == .biometryNotAvailable { problem = "denied" }
            else if code == .passcodeNotSet { problem = "no-passcode" }
            else { problem = "other" }
        }
        call.resolve([
            "available": ok,
            "type": kind(c),
            "problem": problem,
            "message": err?.localizedDescription ?? "",
        ])
    }

    @objc func verify(_ call: CAPPluginCall) {
        let reason = call.getString("reason") ?? "Sblocca Soldi"
        DispatchQueue.main.async {
            let c = LAContext()
            c.localizedFallbackTitle = ""
            c.localizedCancelTitle = "Usa il PIN"
            var err: NSError?
            guard c.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &err) else {
                call.resolve(["ok": false, "code": err?.code ?? 0, "message": err?.localizedDescription ?? "Non disponibile"])
                return
            }
            c.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { success, e in
                // Il contesto deve restare vivo fino alla risposta, altrimenti iOS annulla la richiesta
                _ = c
                let ne = e as NSError?
                call.resolve(["ok": success, "code": ne?.code ?? 0, "message": ne?.localizedDescription ?? ""])
            }
        }
    }
}
