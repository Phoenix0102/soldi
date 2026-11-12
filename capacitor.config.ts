import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.phoenix0102.soldi',
  appName: 'Soldi',
  webDir: 'dist',
  backgroundColor: '#0F4D3A',
  ios: {
    scheme: 'Soldi',
    contentInset: 'never',
    limitsNavigationsToAppBoundDomains: false,
    // Niente anteprime dei link tenendo premuto: è un'app, non un sito
    allowsLinkPreview: false,
  },
  plugins: {
    SplashScreen: { launchAutoHide: false, backgroundColor: '#0F4D3A', showSpinner: false },
    PushNotifications: { presentationOptions: ['banner', 'list', 'sound'] },
  },
}

export default config
