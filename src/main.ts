import { NestFactory } from '@nestjs/core';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Enable CORS for all origins in development
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Global validation pipe with detailed error messages
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false, // Changed to false to be more lenient
      transform: true,
      exceptionFactory: (errors) => {
        const messages = errors.map(error => {
          const constraints = error.constraints ? Object.values(error.constraints) : [];
          console.log(`Validation error for ${error.property}:`, constraints);
          return `${error.property}: ${constraints.join(', ')}`;
        });
        console.log('All validation errors:', messages);
        return new BadRequestException(messages);
      },
    }),
  );

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`🚀 Application is running on: http://localhost:${port}`);
}
bootstrap();



