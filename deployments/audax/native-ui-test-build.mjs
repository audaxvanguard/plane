// Test-only build configuration: bundle real Plane controls and translation hook.
export function nativeUIBuild(root, work, fixture) {
  return {
    entryPoints: [root + '/deployments/audax/' + fixture], bundle: true, write: false,
    format: 'iife', jsx: 'automatic', tsconfigRaw: {}, nodePaths: [work + '/node_modules'],
    define: { 'process.env.NODE_ENV': '"production"' },
    alias: {
      react: work + '/node_modules/react', 'react-dom': work + '/node_modules/react-dom',
      '@plane/constants': root + '/packages/constants/src/issue/common.ts',
      '@plane/propel/icons': root + '/deployments/audax/native-test-icons.ts',
      '@plane/i18n': root + '/packages/i18n/src/hooks/use-translation.ts',
      '@plane/propel/button': root + '/packages/propel/src/button/index.ts',
      '@plane/propel/input': root + '/packages/propel/src/input/index.ts',
      '@plane/propel/dialog': root + '/packages/propel/src/dialog/index.ts',
      '@plane/propel/popover': root + '/packages/propel/src/popover/index.ts',
    },
  };
}
