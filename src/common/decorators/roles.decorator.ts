import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

// Sourced from Prisma's own Role enum rather than a hand-maintained string
// union — if the DB enum is ever renamed/extended, every @Roles(...) call
// site gets a compile error instead of silently drifting out of sync.
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
