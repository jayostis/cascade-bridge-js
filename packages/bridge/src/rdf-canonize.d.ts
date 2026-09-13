declare module "rdf-canonize" {
  const canonize: {
    canonize(input: string, options: { algorithm: string; inputFormat?: string }): Promise<string>;
  };
  export default canonize;
}
