const { withFinalizedMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Forces NSMicrophoneUsageDescription (and, belt-and-braces,
 * NSSpeechRecognitionUsageDescription) into the built Info.plist.
 *
 * History, for whoever reads this next: two earlier attempts both failed
 * in the real build even though each looked right in isolation.
 *
 *   1. Setting the keys directly under app.json's own expo.ios.infoPlist
 *      -- confirmed NOT to survive prebuild (grep on the generated file
 *      came back empty).
 *   2. A local config plugin using withInfoPlist, registered as the last
 *      entry in app.json's plugins array (mods of the same type are
 *      supposed to apply in array order, last one winning). Console
 *      logging proved this plugin *was* being loaded and *did* run, and
 *      it set both keys on config.modResults right before prebuild
 *      finished -- but the generated Info.plist only ended up with
 *      NSSpeechRecognitionUsageDescription. NSMicrophoneUsageDescription
 *      specifically was still missing, even though both keys were set in
 *      the same function call the same way. Something else (almost
 *      certainly expo-speech-recognition's own plugin, or an interaction
 *      with expo-image-picker's "microphonePermission": false) was still
 *      clobbering just that one key after this mod ran.
 *
 * Third attempt: this first tried withDangerousMod, on the assumption
 * that "dangerous" mods run last. They don't -- confirmed directly by
 * reading @expo/config-plugins' own mod-compiler source: dangerous mods
 * are sorted to run *first* (priority -2/-1), specifically so they can
 * prep things before the typed mods (ios.infoPlist, etc.) run and do
 * their own read-modify-write of Info.plist afterward, undoing the
 * dangerous mod's patch. The correct API for "run after literally
 * everything else" is withFinalizedMod (priority 1, sorted last) --
 * confirmed in the same source file. This reads the real Info.plist file
 * the build will actually use, patches the keys in with a plain string
 * replace/insert, and writes it straight back, after every other mod
 * (including whatever was stripping the microphone key before) has
 * already run.
 */
function setPlistString(xml, key, value) {
  const existing = new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`);
  if (existing.test(xml)) {
    return xml.replace(existing, `$1${value}$2`);
  }
  return xml.replace(
    /<\/dict>(\s*<\/plist>\s*)$/,
    `\t<key>${key}</key>\n\t<string>${value}</string>\n</dict>$1`
  );
}

module.exports = function withForceMicPermissions(config) {
  return withFinalizedMod(config, [
    "ios",
    async (config) => {
      const infoPlistPath = path.join(
        config.modRequest.platformProjectRoot,
        config.modRequest.projectName,
        "Info.plist"
      );

      let contents = fs.readFileSync(infoPlistPath, "utf8");
      contents = setPlistString(
        contents,
        "NSMicrophoneUsageDescription",
        "MMDI ONE uses your microphone so you can ask Copilot questions by voice."
      );
      contents = setPlistString(
        contents,
        "NSSpeechRecognitionUsageDescription",
        "MMDI ONE uses speech recognition to turn your voice into text for Copilot."
      );
      fs.writeFileSync(infoPlistPath, contents);

      console.log(
        ">>> withForceMicPermissions.js: patched Info.plist directly on disk (finalized mod, true final pass) <<<"
      );

      return config;
    },
  ]);
};
