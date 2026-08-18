const { withInfoPlist } = require("@expo/config-plugins");

/**
 * Forces NSMicrophoneUsageDescription and NSSpeechRecognitionUsageDescription
 * into the built Info.plist, no matter what any other plugin does to those
 * same keys.
 *
 * Background: setting these two keys directly under app.json's own
 * expo.ios.infoPlist (the normal, simplest fix) did NOT survive into the
 * actual generated Info.plist -- confirmed directly by running
 * `npx expo prebuild --platform ios` and grepping the real output file,
 * which came back empty. expo-speech-recognition's own config plugin
 * (which is supposed to add these) is still published for Expo SDK 56 on
 * an app running SDK 57, so it's plausible its Info.plist mod is silently
 * failing on this newer plugin API; it's also possible
 * expo-image-picker's "microphonePermission": false (an earlier plugin in
 * the array, deliberately opting out of mic access for its own camera/
 * video flow) touches the same key afterward. Rather than keep guessing
 * at which of those it is, this sidesteps the question entirely.
 *
 * Mods of the same type (here, Info.plist) run in the order plugins are
 * listed in app.json's `plugins` array, each one layering its changes on
 * top of the last -- so as long as this plugin is the FINAL entry in that
 * array, nothing that runs after it can undo this. See app.json.
 */
module.exports = function withForceMicPermissions(config) {
  return withInfoPlist(config, (config) => {
    config.modResults.NSMicrophoneUsageDescription =
      "MMDI ONE uses your microphone so you can ask Copilot questions by voice.";
    config.modResults.NSSpeechRecognitionUsageDescription =
      "MMDI ONE uses speech recognition to turn your voice into text for Copilot.";
    return config;
  });
};
