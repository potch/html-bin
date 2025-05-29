import { nodeResolve } from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";

export default {
  input: "src/index.js",
  output: {
    sourcemap: true,
    dir: "build",
    format: "es",
  },
  plugins: [nodeResolve(), terser()],
};
