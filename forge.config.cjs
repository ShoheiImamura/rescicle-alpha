module.exports = {
  packagerConfig: {
    // v0.0.2 deliberately keeps files unpacked so the bundled Codex native binary
    // can be launched reliably from Electron on Windows.
    asar: false,
    executableName: 'rescicle'
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'rescicle',
        authors: 'rescicle project',
        description: 'Local-first research copilot'
      }
    }
  ]
};
