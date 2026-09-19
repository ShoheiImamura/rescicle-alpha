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
        authors: 'rescicle project',
        description: 'Local-first research copilot'
      }
    }
  ]
};
