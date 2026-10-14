module.exports = {
  roots: ['<rootDir>/src/test/unit'],
  testRegex: '(/src/test/.*|\\.(test|spec))\\.(ts|js)$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts?$': 'ts-jest',
    '^.+\\.js$': 'babel-jest',
  },
  // jose is published as ES modules only, which Jest cannot load untransformed.
  transformIgnorePatterns: ['/node_modules/(?!chai|uuid|jose)'],
  modulePathIgnorePatterns: [
    '<rootDir>/src/test/unit/mocks',
    '<rootDir>/src/test/unit/helpers',
    '<rootDir>/src/test/unit/views/helpers',
  ],
};
