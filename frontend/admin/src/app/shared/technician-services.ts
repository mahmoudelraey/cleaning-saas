import { Technician } from '../core/api.types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a technician does at least one of the booking's services.
 * Technicians without services set yet (or with old free-text skills only) match everything.
 */
export function doesAnyService(t: Technician, serviceIds: Set<string>): boolean {
  const mine = t.skills.filter((s) => UUID.test(s));
  return serviceIds.size === 0 || mine.length === 0 || mine.some((id) => serviceIds.has(id));
}
