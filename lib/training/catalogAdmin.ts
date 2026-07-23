import type { User } from '@supabase/supabase-js';
import { getAppAdminEmails, isAppAdmin } from '../appAdmin';

/** Comma-separated admin emails allowed to run catalog imports (server env only). */
export function getCatalogAdminEmails(): string[] {
  return getAppAdminEmails();
}

export function isCatalogAdmin(user: Pick<User, 'email'> | null | undefined): boolean {
  return isAppAdmin(user);
}
