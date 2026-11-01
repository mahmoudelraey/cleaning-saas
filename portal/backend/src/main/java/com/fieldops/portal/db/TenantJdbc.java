package com.fieldops.portal.db;

import java.util.UUID;
import java.util.function.Function;
import java.util.regex.Pattern;

import com.fieldops.portal.config.PortalProperties;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Read-only access to the shared database for one company, with the same isolation as the admin app:
 * each transaction switches to the restricted role and sets {@code app.tenant_id}, so PostgreSQL Row
 * Level Security only shows that company's rows. Queries still filter by tenant/customer explicitly.
 */
@Component
public class TenantJdbc {

    private static final Pattern ROLE_NAME = Pattern.compile("[a-z_][a-z0-9_]{0,62}");

    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate named;
    private final TransactionTemplate readOnly;
    private final String rlsRole;

    public TenantJdbc(JdbcTemplate jdbc, PlatformTransactionManager txm, PortalProperties props) {
        this.jdbc = jdbc;
        this.named = new NamedParameterJdbcTemplate(jdbc);
        this.readOnly = new TransactionTemplate(txm);
        this.readOnly.setReadOnly(true);
        String role = props.db().rlsRole();
        if (role != null && !role.isBlank() && !ROLE_NAME.matcher(role).matches()) {
            throw new IllegalArgumentException("Invalid RLS role name: " + role);
        }
        this.rlsRole = role;
    }

    public <T> T read(UUID tenantId, Function<NamedParameterJdbcTemplate, T> work) {
        return readOnly.execute(status -> {
            if (rlsRole != null && !rlsRole.isBlank()) {
                jdbc.execute("SET LOCAL ROLE " + rlsRole); // validated above; SET cannot take parameters
            }
            jdbc.queryForObject("SELECT set_config('app.tenant_id', ?, true)", String.class, tenantId.toString());
            return work.apply(named);
        });
    }
}
