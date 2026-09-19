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
  ],
  publishers: [
    {
      // `npm run publish` creates (or reuses) the GitHub Release named after
      // package.json's version, e.g. v0.0.3, and uploads the Squirrel installer.
      // Authenticates with GITHUB_TOKEN; .github/workflows/release.yml supplies it.
      name: '@electron-forge/publisher-github',
      config: {
        repository: { owner: 'ShoheiImamura', name: 'rescicle-alpha' },
        draft: false,
        prerelease: false,
        generateReleaseNotes: true
      }
    }
  ]
};
