module.exports = {
  packagerConfig: {
    asar: false,
    executableName: 'rescicle'
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'rescicle',
        // Version-free filename so the README's releases/latest/download link
        // keeps working after a version bump.
        setupExe: 'rescicle-Setup.exe',
        authors: 'rescicle project',
        description: 'Local-first research copilot'
      }
    }
  ]
};
