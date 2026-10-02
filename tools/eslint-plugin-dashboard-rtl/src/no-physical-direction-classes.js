"use strict";

/**
 * A12.1: physical directional CSS properties (left/right-based margin,
 * padding, position, border, radius, float, and the non-RTL-aware
 * `space-x-*` gap utility) are banned from Tailwind class lists in favor
 * of their logical (inline-start/inline-end) equivalents, which flip
 * automatically between the dashboard's ar (dir="rtl") and en (dir="ltr")
 * routes. Icon-mirroring transforms (scale-x-*, rotate-*, rtl:*) are not
 * "directional CSS properties" in the spec's sense and are never flagged.
 */

const BANNED_PATTERNS = [
  { pattern: /^ml-/, suggestion: "ms- (margin-inline-start)" },
  { pattern: /^mr-/, suggestion: "me- (margin-inline-end)" },
  { pattern: /^pl-/, suggestion: "ps- (padding-inline-start)" },
  { pattern: /^pr-/, suggestion: "pe- (padding-inline-end)" },
  { pattern: /^left-/, suggestion: "start- (inset-inline-start)" },
  { pattern: /^right-/, suggestion: "end- (inset-inline-end)" },
  { pattern: /^text-left$/, suggestion: "text-start" },
  { pattern: /^text-right$/, suggestion: "text-end" },
  { pattern: /^float-left$/, suggestion: "float-start" },
  { pattern: /^float-right$/, suggestion: "float-end" },
  { pattern: /^clear-left$/, suggestion: "clear-start" },
  { pattern: /^clear-right$/, suggestion: "clear-end" },
  { pattern: /^border-l(-|$)/, suggestion: "border-s (border-inline-start)" },
  { pattern: /^border-r(-|$)/, suggestion: "border-e (border-inline-end)" },
  { pattern: /^rounded-l(-|$)/, suggestion: "rounded-s (logical start corners)" },
  { pattern: /^rounded-r(-|$)/, suggestion: "rounded-e (logical end corners)" },
  { pattern: /^rounded-tl(-|$)/, suggestion: "rounded-ss (start-start corner)" },
  { pattern: /^rounded-tr(-|$)/, suggestion: "rounded-se (start-end corner)" },
  { pattern: /^rounded-bl(-|$)/, suggestion: "rounded-es (end-start corner)" },
  { pattern: /^rounded-br(-|$)/, suggestion: "rounded-ee (end-end corner)" },
  { pattern: /^space-x-/, suggestion: "gap-x- on a flex/grid container (space-x- is not RTL-aware)" },
];

/** Strips Tailwind variant prefixes (e.g. "md:hover:ml-2" -> "ml-2"). */
function baseToken(token) {
  const parts = token.split(":");
  return parts[parts.length - 1];
}

function checkClassString(value, node, context) {
  const tokens = value.split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    const base = baseToken(token);
    for (const { pattern, suggestion } of BANNED_PATTERNS) {
      if (pattern.test(base)) {
        context.report({
          node,
          message: `Physical directional class "${token}" is banned (A12.1). Use the logical equivalent: ${suggestion}.`,
        });
        break;
      }
    }
  }
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow physical (left/right) directional Tailwind classes; require logical (start/end) equivalents.",
    },
    schema: [],
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name.type !== "JSXIdentifier" || node.name.name !== "className") {
          return;
        }
        const value = node.value;
        if (value && value.type === "Literal" && typeof value.value === "string") {
          checkClassString(value.value, value, context);
        } else if (
          value &&
          value.type === "JSXExpressionContainer" &&
          value.expression.type === "TemplateLiteral"
        ) {
          for (const quasi of value.expression.quasis) {
            checkClassString(quasi.value.raw, quasi, context);
          }
        } else if (
          value &&
          value.type === "JSXExpressionContainer" &&
          value.expression.type === "Literal" &&
          typeof value.expression.value === "string"
        ) {
          checkClassString(value.expression.value, value.expression, context);
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        const calleeName = callee.type === "Identifier" ? callee.name : undefined;
        if (calleeName !== "clsx" && calleeName !== "cn") {
          return;
        }
        for (const arg of node.arguments) {
          if (arg.type === "Literal" && typeof arg.value === "string") {
            checkClassString(arg.value, arg, context);
          } else if (arg.type === "TemplateLiteral") {
            for (const quasi of arg.quasis) {
              checkClassString(quasi.value.raw, quasi, context);
            }
          }
        }
      },
    };
  },
};
