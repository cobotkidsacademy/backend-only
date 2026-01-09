import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Role decorator for role-based access control
 * 
 * @param roles Array of allowed roles
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
