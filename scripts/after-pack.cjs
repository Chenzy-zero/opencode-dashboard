// Electron's stock Info.plist declares camera, microphone, audio-capture and
// Bluetooth usage strings ("This app needs access to …"). This app calls none of
// those APIs, so macOS never prompts — but the declarations read like requested
// permissions to anyone inspecting the bundle. Strip them from the packaged app.
//
// Kept as a deny list on purpose: a future feature that really needs one of
// these must remove the key from this list and say why.
const { execFileSync } = require('node:child_process')
const { join } = require('node:path')

const UNUSED_USAGE_DESCRIPTIONS = [
  'NSAudioCaptureUsageDescription',
  'NSBluetoothAlwaysUsageDescription',
  'NSBluetoothPeripheralUsageDescription',
  'NSCameraUsageDescription',
  'NSMicrophoneUsageDescription',
]

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appName = context.packager.appInfo.productFilename
  const plist = join(context.appOutDir, `${appName}.app`, 'Contents', 'Info.plist')

  for (const key of UNUSED_USAGE_DESCRIPTIONS) {
    try {
      execFileSync('plutil', ['-remove', key, plist])
      console.log(`  • stripped ${key} from Info.plist`)
    } catch {
      // Already absent (for example after an Electron upgrade drops it).
    }
  }
}
