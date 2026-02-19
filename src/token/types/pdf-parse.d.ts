declare module "pdf-parse" {
  export class PDFParse {
    constructor(options: Record<string, unknown>);
    load(data: Buffer | Uint8Array): Promise<void>;
    getText(): Promise<string>;
    destroy(): void;
  }
}
