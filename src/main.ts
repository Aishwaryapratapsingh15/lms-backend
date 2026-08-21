import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { Request } from 'express';
import type { CorsOptions } from 'cors';
import { AppModule } from './app.module';

const PUBLIC_FORM_PATHS = new Set([
  '/otp.php',
  '/changeEmail.php',
  '/finalsubmission.php',
  '/contact.php',
]);

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.use(cookieParser());
  const allowedOrigins = (
    process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors(
    (
      request: Request,
      callback: (error: Error | null, options?: CorsOptions) => void,
    ) => {
      const isPublicForm =
        PUBLIC_FORM_PATHS.has(request.path) ||
        request.path.startsWith('/public/forms/');
      callback(null, {
        // Public forms are embedded on other (legacy/marketing) sites and
        // carry no cookies, so any origin may call them; everything else is
        // the LMS app itself and is restricted + credentialed.
        origin: isPublicForm ? true : allowedOrigins,
        credentials: !isPublicForm,
      });
    },
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Lead Management System API')
    .setDescription(
      'Backend documentation for Super Admin, Admin and Sales workflows.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.PORT || 4000);
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`Swagger docs: http://localhost:${port}/api/docs`);
}

bootstrap();
