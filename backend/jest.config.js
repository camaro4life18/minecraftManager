export default {
  testEnvironment: 'node',
  transform: {},
  testMatch: ['**/__tests__/**/*.test.js', '**/*.test.js'],
  collectCoverageFrom: [
    'sshClient.js',
    'server.js',
    '!node_modules/**'
  ]
};
