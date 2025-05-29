import { nodeResolve } from "@rollup/plugin-node-resolve";
import postcss from "postcss";
import cssnano from "cssnano";
import css from "rollup-plugin-import-css";
import terser from "@rollup/plugin-terser";

export default {
  input: "src/index.js",
  output: {
    sourcemap: true,
    file: "build/index.min.js",
    format: "es",
  },
  plugins: [
    nodeResolve(),
    css({
      transform: async (source) => {
        const result = await postcss([cssnano()]).process(source, {
          from: undefined,
        });
        return result.css;
      },
    }),
    terser(),
  ],
};
