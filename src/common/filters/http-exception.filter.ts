import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { STATUS_CODES } from 'http';
import { Response } from 'express';

// Normalizes every HttpException response into one consistent shape —
// {statusCode, error, message, ...extras} — regardless of whether the
// call site threw a plain string (Nest's default) or a custom object
// payload (e.g. leads.service.ts's `{message, duplicate}`, or
// public-forms.service.ts's ad-hoc `{status, message}`). Without this,
// frontend code has to guess which shape a given endpoint's errors use.
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const statusCode = exception.getStatus();
    const raw = exception.getResponse();

    const extras: Record<string, unknown> =
      typeof raw === 'string'
        ? { message: raw }
        : { ...(raw as Record<string, unknown>) };

    // Some call sites embed their own (sometimes differently-named,
    // sometimes stale) status field in the payload — the one computed
    // above from the exception itself is always the authoritative one.
    delete extras.status;
    delete extras.statusCode;
    delete extras.error;

    response.status(statusCode).json({
      statusCode,
      error: STATUS_CODES[statusCode] ?? exception.name,
      ...extras,
    });
  }
}
