package com.fieldops.app.catalog;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

import jakarta.persistence.EntityManager;

import com.fieldops.app.common.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CatalogService {

    private final ServiceOfferingRepository services;
    private final EntityManager em;

    public CatalogService(ServiceOfferingRepository services, EntityManager em) {
        this.services = services;
        this.em = em;
    }

    public record ServiceData(String name, String description, String nameEn, String descriptionEn,
                              PricingType pricingType, long basePriceHalalas, int durationMin, boolean active) {
    }

    public record AddonData(String name, String nameEn, long priceHalalas, boolean active) {
    }

    /** @param durationMin minutes per unit, null = the service's duration; @param position display order (0 first). */
    public record OptionData(String name, String nameEn, long priceHalalas, Integer durationMin, boolean active,
                             int position) {
    }

    @Transactional(readOnly = true)
    public List<ServiceOffering> list(boolean activeOnly) {
        return activeOnly ? services.findActiveWithAddons() : services.findAllWithAddons();
    }

    @Transactional(readOnly = true)
    public ServiceOffering get(UUID id) {
        return services.findWithAddons(id).orElseThrow(() -> ApiException.notFound("service"));
    }

    @Transactional
    public ServiceOffering create(ServiceData d) {
        requireUniqueNames(d, null);
        ServiceOffering s = new ServiceOffering(d.name().trim(), blankToNull(d.description()), d.pricingType(),
                d.basePriceHalalas(), d.durationMin());
        s.setEnglish(blankToNull(d.nameEn()), blankToNull(d.descriptionEn()));
        if (!d.active()) {
            s.deactivate();
        }
        return services.save(s);
    }

    @Transactional
    public ServiceOffering update(UUID id, ServiceData d) {
        ServiceOffering s = get(id);
        requireUniqueNames(d, id);
        s.update(d.name().trim(), blankToNull(d.description()), d.pricingType(), d.basePriceHalalas(),
                d.durationMin(), d.active());
        s.setEnglish(blankToNull(d.nameEn()), blankToNull(d.descriptionEn()));
        return s;
    }

    /** Customers pick services by name, so two services of one company can't share an Arabic or English name. */
    private void requireUniqueNames(ServiceData d, UUID exceptId) {
        UUID except = exceptId == null ? new UUID(0, 0) : exceptId;
        if (services.nameTaken(normalized(d.name()), except)) {
            throw ApiException.conflict("service_name_taken", "Another service already has this name");
        }
        String en = blankToNull(d.nameEn());
        if (en != null && services.nameEnTaken(normalized(en), except)) {
            throw ApiException.conflict("service_name_en_taken", "Another service already has this English name");
        }
    }

    /** Lower case and trimmed, the same as the database side of the check (lower(trim(name))). */
    private static String normalized(String name) {
        return name.trim().toLowerCase(Locale.ROOT);
    }

    /** Archive instead of delete: past bookings and invoices keep referencing the service. */
    @Transactional
    public void archive(UUID id) {
        get(id).deactivate();
    }

    @Transactional
    public ServiceAddon addAddon(UUID serviceId, AddonData d) {
        ServiceOffering s = get(serviceId);
        ServiceAddon addon = s.addAddon(new ServiceAddon(d.name().trim(), d.priceHalalas()));
        addon.setNameEn(blankToNull(d.nameEn()));
        if (!d.active()) {
            addon.update(addon.getName(), addon.getPriceHalalas(), false);
        }
        services.flush();
        return addon;
    }

    @Transactional
    public ServiceAddon updateAddon(UUID serviceId, UUID addonId, AddonData d) {
        ServiceAddon addon = findAddon(get(serviceId), addonId);
        addon.update(d.name().trim(), d.priceHalalas(), d.active());
        addon.setNameEn(blankToNull(d.nameEn()));
        return addon;
    }

    @Transactional
    public void deleteAddon(UUID serviceId, UUID addonId) {
        ServiceOffering s = get(serviceId);
        s.removeAddon(findAddon(s, addonId));
    }

    @Transactional
    public ServiceOption addOption(UUID serviceId, OptionData d) {
        ServiceOffering s = get(serviceId);
        ServiceOption option = s.addOption(new ServiceOption(d.name().trim(), blankToNull(d.nameEn()), d.priceHalalas(),
                d.durationMin(), d.active(), d.position()));
        services.flush();
        return option;
    }

    @Transactional
    public ServiceOption updateOption(UUID serviceId, UUID optionId, OptionData d) {
        ServiceOption option = findOption(get(serviceId), optionId);
        option.update(d.name().trim(), blankToNull(d.nameEn()), d.priceHalalas(), d.durationMin(), d.active(),
                d.position());
        return option;
    }

    /**
     * Removes an option. One that bookings or quotes/invoices already used is archived instead (switched off), so
     * those records keep their wording; it then simply disappears from new bookings.
     */
    @Transactional
    public void deleteOption(UUID serviceId, UUID optionId) {
        ServiceOffering s = get(serviceId);
        ServiceOption option = findOption(s, optionId);
        if (isOptionUsed(optionId)) {
            option.deactivate();
        } else {
            s.removeOption(option);
        }
    }

    private boolean isOptionUsed(UUID optionId) {
        Object used = em.createNativeQuery("""
                        select exists(select 1 from booking_items where option_id = :id)
                            or exists(select 1 from document_lines where option_id = :id)""")
                .setParameter("id", optionId)
                .getSingleResult();
        return Boolean.TRUE.equals(used);
    }

    private static ServiceOption findOption(ServiceOffering s, UUID optionId) {
        return s.getOptions().stream()
                .filter(o -> o.getId().equals(optionId))
                .findFirst()
                .orElseThrow(() -> ApiException.notFound("option"));
    }

    private static ServiceAddon findAddon(ServiceOffering s, UUID addonId) {
        return s.getAddons().stream()
                .filter(a -> a.getId().equals(addonId))
                .findFirst()
                .orElseThrow(() -> ApiException.notFound("addon"));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
