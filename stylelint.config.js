export default {
  extends: ["stylelint-config-standard"],
  ignoreFiles: ["dist/**", "dist-pages/**", "node_modules/**", "public/**"],
  rules: {
    "alpha-value-notation": "number",
    "at-rule-no-unknown": [true, { ignoreAtRules: ["custom-variant"] }],
    "color-function-notation": "modern",
    "color-hex-length": "short",
    "custom-property-empty-line-before": null,
    "declaration-block-no-redundant-longhand-properties": true,
    "font-family-name-quotes": "always-where-recommended",
    "hue-degree-notation": null,
    "import-notation": "string",
    "length-zero-no-unit": true,
    "lightness-notation": null,
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
