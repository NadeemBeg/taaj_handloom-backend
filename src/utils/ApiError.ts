/** Operational error with an HTTP status. Thrown by services/controllers. */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly errors?: Array<{ field?: string; message: string }>;
  public readonly isOperational = true;

  constructor(
    statusCode: number,
    message: string,
    errors?: Array<{ field?: string; message: string }>,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    Object.setPrototypeOf(this, ApiError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, errors?: ApiError['errors']) {
    return new ApiError(400, message, errors);
  }
  static unauthorized(message = 'Unauthorized') {
    return new ApiError(401, message);
  }
  static forbidden(message = 'Forbidden') {
    return new ApiError(403, message);
  }
  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }
  static conflict(message: string) {
    return new ApiError(409, message);
  }
  static internal(message = 'Something went wrong') {
    return new ApiError(500, message);
  }
}
