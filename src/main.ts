import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import type { CorsOptions } from 'cors';
import type { Request } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.use(cookieParser());
  const publicFormPaths = new Set([
    '/otp.php',
    '/changeEmail.php',
    '/finalsubmission.php',
    '/contact.php',
  ]);
  app.use(
    cors(
      (
        request: Request,
        callback: (error: Error | null, options?: CorsOptions) => void,
      ) => {
        const isPublicForm =
          publicFormPaths.has(request.path) ||
          request.path.startsWith('/public/forms/');
        callback(null, {
          origin: isPublicForm
            ? true
            : process.env.FRONTEND_URL || 'http://localhost:3000',
          credentials: !isPublicForm,
        });
      },
    ),
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
