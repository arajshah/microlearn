/** HTTP-aware error for REST handlers. Carries a status code and safe message. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const notFound = (message = 'Not found') => new ApiError(404, message, 'NOT_FOUND');
export const badRequest = (message: string, code = 'INVALID_INPUT') => new ApiError(400, message, code);
