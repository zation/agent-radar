export default {
  extends: ["stylelint-config-standard"],
  ignoreFiles: ["dist/**", "dist-pages/**", "node_modules/**", "public/**"],
  rules: {
    "alpha-value-notation": "number",
    "color-function-notation": "modern",
    "color-hex-length": "short",
    "declaration-block-no-redundant-longhand-properties": true,
    "font-family-name-quotes": "always-where-recommended",
    "length-zero-no-unit": true,
    "no-descending-specificity": null,
    "selector-class-pattern": [
      "^[a-z][a-z0-9-]*$",
      {
        message: "Expected class selectors to use kebab-case."
      }
    ],
    "shorthand-property-no-redundant-values": true
  }
};
