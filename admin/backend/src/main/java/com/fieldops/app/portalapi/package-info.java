/**
 * Server-to-server API for the customer portal backend (portal/backend). The portal owns customer
 * sign-in and reads its screens straight from the shared database; anything that changes a booking goes
 * through here so pricing, scheduling, the state machine, events and customer messages stay in one place.
 *
 * <p>Not public: guarded by a shared secret ({@code app.portal.internal-token}) and meant to be reachable
 * only on the internal network (don't route {@code /internal/**} through the public proxy).
 */
package com.fieldops.app.portalapi;
