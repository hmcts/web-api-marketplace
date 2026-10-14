module.exports = {
  roots: ['<rootDir>/src/test/routes'],
  testRegex: '(/src/test/.*|\\.(test|spec))\\.(ts|js)$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts?$': 'ts-jest',
    '^.+\\.js$': 'babel-jest',
  },
  // jose is published as ES modules only, which Jest cannot load untransformed.
  transformIgnorePatterns: ['/node_modules/(?!chai|uuid|jose)'],
  // The shared journey harness is a helper, not a suite — testRegex would otherwise pick
  // it up and fail it for containing no tests.
  modulePathIgnorePatterns: ['<rootDir>/src/test/routes/helpers'],
};
