package com.fieldops.app.common.security;

public enum Role {
    /** Company owner: billing, settings, prices, staff. */
    OWNER,
    /** Dispatcher: receives requests, schedules, assigns technicians. */
    COORDINATOR,
    /** Field technician: sees and updates own visits (PWA). */
    TECHNICIAN,
    /** The FieldOps platform owner: plans, companies' subscriptions, platform messaging. Belongs to no company. */
    PLATFORM_ADMIN
}
