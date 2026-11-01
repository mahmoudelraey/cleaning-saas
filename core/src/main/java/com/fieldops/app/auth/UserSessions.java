package com.fieldops.app.auth;

import java.util.UUID;

/**
 * Signs a staff user out everywhere (implemented by the admin app's refresh-token store). Lives in core
 * so {@link UserService} can call it without depending on the admin app's token machinery.
 */
public interface UserSessions {

    void revokeAll(UUID userId);
}
