export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (code, msg, details) => new AppError(400, code, msg, details);
export const notFound = (code, msg) => new AppError(404, code, msg);
export const upstream = (code, msg) => new AppError(502, code, msg);
