/*******************************************************************************
 * Licensed Materials - Property of IBM
 * (c) Copyright IBM Corporation 2016. All Rights Reserved.
 *
 * Note to U.S. Government Users Restricted Rights:
 * Use, duplication or disclosure restricted by GSA ADP Schedule
 * Contract with IBM Corp.
 *******************************************************************************/
/* eslint global-require:0 */
"use strict";

// Modules

var appConfig = require("./config/app.json");
var path = require("path");
var webpack = require("webpack");
var I18NPlugin = require("@dap/portal-common-i18n").I18nPlugin;
var babelOptions = require("./scripts/babel/babelOptions").babelClientOptions;
var SassLintPlugin = require("sasslint-webpack-plugin");
var constants = require("./lib/constants");
var scope = require("./scripts/build/css-scope");

// possibly not needed after removing html
var HtmlWebpackPlugin = require("html-webpack-plugin");

// Globals

var HMR_ENABLED = process.env.HMR_ENABLED === "true";
// Entry & Output files ------------------------------------------------------------>

var entry = [
	"babel-polyfill",
	"./src/client/index.js"
];
if (HMR_ENABLED) {

	/* Setup HMR endpoint at /data/graphdb/__webpack_hmr. This is a
	 * limitation of webpack. See:
	 * https://github.com/webpack/webpack-dev-server/issues/252
	 */
	var hmrUrl = "https://localhost:" + appConfig.port.https + constants.APP_PATH + "/__webpack_hmr";
	entry.unshift("webpack-hot-middleware/client?path=" + hmrUrl);
}

var output = {
	path: path.join(__dirname, ".build"),
	publicPath: constants.APP_PATH,
	filename: "js/canvasharness.js",
	chunkFilename: "js/canvasharness.chunk.[id].js",
	sourceMapFilename: "[file].map",
	devtoolModuleFilenameTemplate: "[resource]",
	pathinfo: true
};


// Loaders ------------------------------------------------------------>

var loaders = [
	{
		test: /\.json$/,
		loader: "json-loader"
	},
	{
		test: /\.js(x?)$/,
		loader: "babel",
		exclude: /node_modules/,
		query: babelOptions
	},
	{
		test: /\.s*css$/,
		loaders: [
			"style",
			"css?modules&localIdentName=" + scope.getCssScope(),
			"sass",
			"postcss"
		]
	},
	{
		test: /\.png$/,
		loaders: [
			"file?name=graphics/[hash].[ext]"
		]
	}
];

// Custom functions (for plugins) ------------------------------------->


// Plugins ------------------------------------------------------------>

var plugins = [
	new webpack.optimize.OccurrenceOrderPlugin(),
	new SassLintPlugin({
		configFile: ".sass-lint.yml",
		context: "./src/components",
		glob: "**/*.scss",
		quiet: false,
		failOnWarning: true,
		failOnError: true
	}),
	new I18NPlugin("en"),
	new webpack.NoErrorsPlugin(),
	// Generates an `index.html` file with the <script> injected.
	new HtmlWebpackPlugin({
		inject: true,
		template: "public/index.html"
	})
];
if (HMR_ENABLED) {
	plugins.push(new webpack.HotModuleReplacementPlugin());
}

// Postcss ------------------------------------------------------------>

var postcss = [
	require("stylelint"),
	require("autoprefixer")
];

// Exports ------------------------------------------------------------>

module.exports = {
	entry: entry,
	resolve: {
		modulesDirectories: ["web_modules", "node_modules"]
	},
	// Uncomment this to see details of Webpack build failures
	// stats: {
	// 	errorDetails: true
	// },
	// Uncomment below to help debug a production build
	// debug: true,
	// devtool: "source-map",
	// devtoolModuleFilenameTemplate: "[resource]",
	// pathinfo: true,
	output: output,
	module: {
		loaders: loaders
	},
	plugins: plugins,
	postcss: postcss,
	debug: true,
	devtool: "source-map"
};
