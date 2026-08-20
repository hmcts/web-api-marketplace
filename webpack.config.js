const path = require('path');

const sourcePath = path.resolve(__dirname, 'src/main/bundles');
const govukFrontend = require(path.resolve(__dirname, 'webpack/govukFrontend'));
const scss = require(path.resolve(__dirname, 'webpack/scss'));
const HtmlWebpack = require(path.resolve(__dirname, 'webpack/htmlWebpack'));

const devMode = process.env.NODE_ENV !== 'production';
const fileNameSuffix = devMode ? '-dev' : '.[contenthash]';
const filename = `[name]${fileNameSuffix}.js`;

module.exports = {
  plugins: [...govukFrontend.plugins, ...scss.plugins, ...HtmlWebpack.plugins],
  entry: {
    main: path.resolve(sourcePath, 'index.ts'),
    cookies: path.resolve(sourcePath, 'cookie-preferences.ts'),
  },
  mode: devMode ? 'development' : 'production',
  module: {
    rules: [
      ...scss.rules,
      {
        test: /\.ts$/,
        use: {
          loader: 'ts-loader',
          options: {
            onlyCompileBundledFiles: true,
          },
        },
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  output: {
    path: path.resolve(__dirname, 'src/main/public/'),
    publicPath: '',
    filename,
  },
};
