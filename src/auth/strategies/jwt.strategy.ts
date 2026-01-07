import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'your-secret-key-change-in-production',
    });
  }

  async validate(payload: any) {
    // Check if it's a student, tutor, parent, school, or admin token
    if (payload.role === 'student') {
      // For students, return the payload directly (we'll validate in the endpoint)
      return {
        sub: payload.sub,
        username: payload.username,
        role: payload.role,
      };
    } else if (payload.role === 'tutor') {
      // For tutors, return the payload directly (we'll validate in the endpoint)
      return {
        sub: payload.sub,
        email: payload.email,
        role: payload.role,
      };
    } else if (payload.role === 'parent') {
      // For parents, return the payload directly
      return {
        sub: payload.sub,
        email: payload.email,
        role: payload.role,
      };
    } else if (payload.role === 'school') {
      // For schools, return the payload directly
      return {
        sub: payload.sub,
        email: payload.email,
        role: payload.role,
      };
    } else {
      // For admins, validate through the service
      const user = await this.authService.validateUser(payload.sub);
      if (!user) {
        throw new UnauthorizedException();
      }
      return user;
    }
  }
}





