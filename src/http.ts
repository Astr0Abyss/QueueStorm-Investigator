export type ApiRequest = {
  method?: string;
  body?: unknown;
};

export type ApiResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): {
    json(payload: unknown): void;
  };
};
