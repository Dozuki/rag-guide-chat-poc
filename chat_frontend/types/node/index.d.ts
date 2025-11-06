declare module "node:*" {
  const value: any;
  export default value;
}

declare module "rollup/parseAst" {
  const value: any;
  export default value;
}

declare const process: {
  env: Record<string, string | undefined>;
  cwd(): string;
  [key: string]: unknown;
};
