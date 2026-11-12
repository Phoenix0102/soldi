import UIKit
import Capacitor

/// Bridge di Capacitor con i plugin propri dell'app (widget).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WidgetBridgePlugin())
    }
}
