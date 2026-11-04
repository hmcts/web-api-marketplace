module.exports = {
  roots: ['<rootDir>/src/test/pact'],
  testRegex: '\\.pact\\.test\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  testEnvironment: 'node',
  testTimeout: 30000,
  transform: {
    '^.+\\.ts?$': 'ts-jest',
    '^.+\\.js$': 'babel-jest',
  },
  transformIgnorePatterns: ['/node_modules/(?!chai|uuid|jose)'],
};
