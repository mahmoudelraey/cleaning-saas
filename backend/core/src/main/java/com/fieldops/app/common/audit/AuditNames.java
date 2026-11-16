package com.fieldops.app.common.audit;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;

import com.fieldops.app.auth.UserRepository;
import com.fieldops.app.common.persistence.BaseEntity;
import com.fieldops.app.common.web.PageResponse;
import org.springframework.data.domain.Page;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Builds {@link AuditInfo} for API responses, looking up the users' names in one query per list (no N+1).
 *
 * <pre>
 * var audit = auditNames.forAll(customers);          // one query for the whole page
 * customers.stream().map(c -> Dto.of(c, audit.apply(c)))
 * </pre>
 */
@Component
public class AuditNames {

    private final UserRepository users;

    public AuditNames(UserRepository users) {
        this.users = users;
    }

    /** Audit info of one record. */
    @Transactional(readOnly = true)
    public AuditInfo of(BaseEntity e) {
        return e == null ? null : forAll(List.of(e)).apply(e);
    }

    /** A function giving the audit info of each record in {@code list}, with all names fetched up front. */
    @Transactional(readOnly = true)
    public <T extends BaseEntity> Function<T, AuditInfo> forAll(Collection<? extends T> list) {
        Map<UUID, String> names = names(list.stream()
                .flatMap(e -> java.util.stream.Stream.of(e.getCreatedBy(), e.getUpdatedBy()))
                .filter(Objects::nonNull)
                .distinct()
                .toList());
        return e -> e == null ? null : info(e.getCreatedAt(), e.getCreatedBy(), e.getUpdatedAt(), e.getUpdatedBy(), names);
    }

    /** A page of entities as DTOs, each with its audit info. */
    @Transactional(readOnly = true)
    public <E extends BaseEntity, D> PageResponse<Audited<D>> page(Page<E> page, Function<E, D> mapper) {
        Function<E, AuditInfo> audit = forAll(page.getContent());
        return PageResponse.of(page, e -> new Audited<>(mapper.apply(e), audit.apply(e)));
    }

    /** Entities as DTOs, each with its audit info. */
    @Transactional(readOnly = true)
    public <E extends BaseEntity, D> List<Audited<D>> list(Collection<E> items, Function<E, D> mapper) {
        Function<E, AuditInfo> audit = forAll(items);
        return items.stream().map(e -> new Audited<>(mapper.apply(e), audit.apply(e))).toList();
    }

    /** Items that are not entities themselves (views, wrappers): {@code entity} gives the record behind each. */
    @Transactional(readOnly = true)
    public <S, D> List<Audited<D>> list(Collection<S> items, Function<S, ? extends BaseEntity> entity,
                                       Function<S, D> mapper) {
        Function<BaseEntity, AuditInfo> audit = forAll(items.stream().<BaseEntity>map(entity).toList());
        return items.stream().map(s -> new Audited<>(mapper.apply(s), audit.apply(entity.apply(s)))).toList();
    }

    /** One entity as a DTO with its audit info. */
    @Transactional(readOnly = true)
    public <E extends BaseEntity, D> Audited<D> one(E e, Function<E, D> mapper) {
        return new Audited<>(mapper.apply(e), of(e));
    }

    /** Audit info from raw values (SQL read models). */
    public static AuditInfo info(java.time.Instant createdAt, UUID createdBy, java.time.Instant updatedAt,
                                 UUID updatedBy, Map<UUID, String> names) {
        return new AuditInfo(createdAt, createdBy, createdBy == null ? null : names.get(createdBy),
                updatedAt, updatedBy, updatedBy == null ? null : names.get(updatedBy));
    }

    /** id → current name of the given users (unknown ids are left out). */
    @Transactional(readOnly = true)
    public Map<UUID, String> names(Collection<UUID> ids) {
        Map<UUID, String> out = new HashMap<>();
        if (ids == null || ids.isEmpty()) {
            return out;
        }
        for (Object[] row : users.findNames(ids)) {
            out.put((UUID) row[0], (String) row[1]);
        }
        return out;
    }
}
