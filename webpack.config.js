const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

module.exports = {
    entry: "./src/App.jsx",
    output: { path: path.resolve(__dirname, "dist"), filename: "main.js", clean: true },
    target: "web",
    module: {
        rules: [
            { test: /\.(js|jsx)$/, exclude: /node_modules/, use: { loader: "babel-loader", options: { presets: ["@babel/preset-env", "@babel/preset-react"] } } },
            { test: /\.css$/, use: ["style-loader", "css-loader"] }
        ]
    },
    resolve: { extensions: [".js", ".jsx"] },
    externals: { photoshop: "commonjs photoshop", uxp: "commonjs uxp" },
    plugins: [
        new CopyPlugin({ patterns: [{ from: "manifest.json", to: "." }, { from: "index.html", to: "." }] })
    ]
};
