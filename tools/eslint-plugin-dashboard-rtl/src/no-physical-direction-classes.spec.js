import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import rule from "./no-physical-direction-classes.js";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
});

ruleTester.run("no-physical-direction-classes", rule, {
  valid: [
    { code: '<div className="ms-2 me-4 ps-1 pe-1 start-0 end-0" />' },
    { code: '<div className="text-start rounded-ss-lg gap-x-2" />' },
    { code: '<div className="md:hover:ms-4 rtl:scale-x-[-1]" />' },
    { code: 'clsx("flex", condition && "ms-2")' },
    { code: "<div className={`ms-2 ${extra}`} />" },
  ],
  invalid: [
    {
      code: '<div className="ml-2" />',
      errors: [{ message: /Physical directional class "ml-2" is banned/ }],
    },
    {
      code: '<div className="mr-4 text-right" />',
      errors: [
        { message: /Physical directional class "mr-4" is banned/ },
        { message: /Physical directional class "text-right" is banned/ },
      ],
    },
    {
      code: '<div className="pl-2" />',
      errors: [{ message: /padding-inline-start/ }],
    },
    {
      code: '<div className="border-l-2 rounded-tl-lg" />',
      errors: [
        { message: /Physical directional class "border-l-2" is banned/ },
        { message: /Physical directional class "rounded-tl-lg" is banned/ },
      ],
    },
    {
      code: '<div className="md:hover:ml-2" />',
      errors: [{ message: /Physical directional class "md:hover:ml-2" is banned/ }],
    },
    {
      code: 'clsx("flex", "space-x-4")',
      errors: [{ message: /space-x-/ }],
    },
    {
      code: "<div className={`ml-2 ${extra}`} />",
      errors: [{ message: /Physical directional class "ml-2" is banned/ }],
    },
  ],
});
