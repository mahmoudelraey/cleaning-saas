package com.fieldops.app.booking;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;

import com.fieldops.app.catalog.CatalogService;
import com.fieldops.app.catalog.PricingType;
import com.fieldops.app.catalog.ServiceAddon;
import com.fieldops.app.catalog.ServiceOffering;
import com.fieldops.app.common.web.ApiException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Turns "what the customer wants" into priced lines and an estimated duration, always from the
 * current catalog: clients send service ids and quantities, never prices.
 */
@Component
public class BookingPricing {

    private static final BigDecimal MAX_QUANTITY = BigDecimal.valueOf(10_000);

    private final CatalogService catalog;

    public BookingPricing(CatalogService catalog) {
        this.catalog = catalog;
    }

    /** @param quantity FIXED: count (default 1), HOURLY: hours, PER_SQM: square metres. */
    public record Line(UUID serviceId, BigDecimal quantity, List<UUID> addonIds) {
    }

    public record Priced(List<BookingItem> items, long subtotalHalalas, int durationMin) {
    }

    @Transactional(readOnly = true)
    public Priced price(List<Line> lines) {
        if (lines == null || lines.isEmpty()) {
            throw ApiException.badRequest("items_required", "Choose at least one service");
        }
        List<BookingItem> items = new ArrayList<>();
        long subtotal = 0;
        int duration = 0;
        for (Line line : lines) {
            ServiceOffering service = catalog.get(line.serviceId());
            if (!service.isActive()) {
                throw ApiException.conflict("service_inactive", service.getName() + " is no longer offered");
            }
            BigDecimal qty = quantityFor(service, line.quantity());
            BookingItem main = new BookingItem(service.getId(), null, service.getName(), qty,
                    service.getBasePriceHalalas());
            items.add(main);
            subtotal += main.getTotalHalalas();
            duration += durationFor(service, qty);

            for (UUID addonId : new LinkedHashSet<>(line.addonIds() == null ? List.<UUID>of() : line.addonIds())) {
                ServiceAddon addon = service.getAddons().stream()
                        .filter(a -> a.getId().equals(addonId) && a.isActive())
                        .findFirst()
                        .orElseThrow(() -> ApiException.badRequest("invalid_addon", "Add-on not available for this service"));
                BookingItem extra = new BookingItem(service.getId(), addon.getId(),
                        service.getName() + " — " + addon.getName(), BigDecimal.ONE, addon.getPriceHalalas());
                items.add(extra);
                subtotal += extra.getTotalHalalas();
            }
        }
        return new Priced(items, subtotal, Math.max(duration, 15));
    }

    private static BigDecimal quantityFor(ServiceOffering service, BigDecimal requested) {
        BigDecimal qty = requested == null ? null : requested.stripTrailingZeros();
        if (service.getPricingType() != PricingType.FIXED && qty == null) {
            throw ApiException.badRequest("quantity_required",
                    service.getPricingType() == PricingType.HOURLY ? "Enter the number of hours" : "Enter the area in m²");
        }
        if (qty == null) {
            qty = BigDecimal.ONE;
        }
        if (qty.signum() <= 0 || qty.compareTo(MAX_QUANTITY) > 0) {
            throw ApiException.badRequest("invalid_quantity", "Quantity is out of range");
        }
        if (service.getPricingType() == PricingType.FIXED && qty.scale() > 0) {
            throw ApiException.badRequest("invalid_quantity", "Quantity must be a whole number for fixed-price services");
        }
        return qty;
    }

    /** FIXED: duration × count, HOURLY: the hours booked, PER_SQM: the service's estimate. */
    private static int durationFor(ServiceOffering service, BigDecimal qty) {
        return switch (service.getPricingType()) {
            case FIXED -> service.getDurationMin() * qty.intValueExact();
            case HOURLY -> qty.multiply(BigDecimal.valueOf(60)).setScale(0, java.math.RoundingMode.CEILING).intValue();
            case PER_SQM -> service.getDurationMin();
        };
    }
}
