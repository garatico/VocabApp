import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vocabapp.app',
  appName: 'VocabApp',
  webDir: 'dist',
  plugins: {
    // Edge-to-edge: the page runs under the system's back/home/recents bar, and env(safe-area-inset-*) says by how much.
    // Fixed bottom elements and the body's padding use it, so nothing tappable sits under that bar.
    SystemBars: { insetsHandling: 'native', initialViewportFitValueHint: 'cover' },
  },
};

export default config;
