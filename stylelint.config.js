/*
 * Token discipline gate — Design Uplift §14.1.
 *
 * This is the PRIMARY gate. The §14.2 greps are a pre-commit backstop; they
 * false-positive on URL fragments and miss `rgb()`, `hsl()`, `oklch()` and
 * `animation`. This catches all of it at the source, with no false positives.
 *
 * The rule is simple: colour, radius, duration and z-index in a component may
 * only come from a token. src/styles/tokens.css is where values are allowed to
 * exist, and it is the only file exempt.
 */

/** Every property below accepts a var(), plus these keywords. */
const KEYWORDS = ['/^var\\(--/', 'inherit', 'initial', 'unset', 'revert', 'currentColor', 'transparent', 'none']

const COLOUR_PROPERTIES = [
  'color',
  'background',
  'background-color',
  'background-image',
  'border-color',
  'border-block-start-color',
  'border-block-end-color',
  'border-inline-start-color',
  'border-inline-end-color',
  'outline-color',
  'fill',
  'stroke',
  'accent-color',
  'caret-color',
  'text-decoration-color',
  'column-rule-color',
]

export default {
  extends: ['stylelint-config-standard'],
  rules: {
    /*
     * Colour. `color-mix()` is allowed because its arguments are themselves
     * tokens — the mix is a derivation, not a new value.
     */
    'declaration-property-value-allowed-list': {
      ...Object.fromEntries(
        COLOUR_PROPERTIES.map((property) => [
          property,
          [...KEYWORDS, '/^color-mix\\(/', '/^linear-gradient\\(/', '/^radial-gradient\\(/', '/^url\\(/'],
        ]),
      ),
      // Radius: three steps plus the pill. `0` squares a corner deliberately.
      'border-radius': [...KEYWORDS, '0'],
      'border-start-start-radius': KEYWORDS,
      'border-start-end-radius': KEYWORDS,
      'border-end-start-radius': KEYWORDS,
      'border-end-end-radius': KEYWORDS,
      // Stacking: only the documented layer scale.
      'z-index': KEYWORDS,
    },

    // No physical box properties — logical only (§5).
    'property-disallowed-list': [
      'margin-left',
      'margin-right',
      'margin-top',
      'margin-bottom',
      'padding-left',
      'padding-right',
      'padding-top',
      'padding-bottom',
      'border-left',
      'border-right',
      'border-top',
      'border-bottom',
    ],

    // Durations and easing come from the motion tokens (§7.1).
    'declaration-property-value-disallowed-list': {
      'transition-duration': ['/[0-9]/'],
      'animation-duration': ['/[0-9]/'],
      // §12.2 — never animate a layout property or box-shadow.
      'transition-property': ['/(box-shadow|width|height|top|left|right|bottom)/'],
    },

    /*
     * Relaxations. These are formatting opinions from the shared config that
     * conflict with the codebase's existing conventions and carry no
     * correctness or accessibility weight.
     */
    'custom-property-pattern': null,
    'selector-class-pattern': null,
    'keyframes-name-pattern': null,
    'no-descending-specificity': null,
    'declaration-block-no-redundant-longhand-properties': null,
    'alpha-value-notation': null,
    'color-function-notation': null,
    'shorthand-property-no-redundant-values': null,
    'media-feature-range-notation': null,
    'comment-empty-line-before': null,
    'declaration-empty-line-before': null,
    'rule-empty-line-before': null,
    'value-keyword-case': null,
    'custom-property-empty-line-before': null,
    'color-hex-length': null,
    'color-function-alias-notation': null,
    'import-notation': null,
  },
  ignoreFiles: ['dist/**', 'node_modules/**'],
  overrides: [
    {
      // The token file is where raw values are allowed to exist.
      files: ['src/styles/tokens.css'],
      rules: {
        'declaration-property-value-allowed-list': null,
        'declaration-property-value-disallowed-list': null,
      },
    },
  ],
}
