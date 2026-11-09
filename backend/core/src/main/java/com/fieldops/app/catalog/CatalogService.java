package com.fieldops.app.catalog;

import java.util.List;
import java.util.UUID;

import com.fieldops.app.common.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CatalogService {

    private final ServiceOfferingRepository services;

    public CatalogService(ServiceOfferingRepository services) {
        this.services = services;
    }

    public record ServiceData(String name, String description, String nameEn, String descriptionEn,
                              PricingType pricingType, long basePriceHalalas, int durationMin, boolean active) {
    }

    public record AddonData(String name, String nameEn, long priceHalalas, boolean active) {
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
        s.update(d.name().trim(), blankToNull(d.description()), d.pricingType(), d.basePriceHalalas(),
                d.durationMin(), d.active());
        s.setEnglish(blankToNull(d.nameEn()), blankToNull(d.descriptionEn()));
        return s;
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
