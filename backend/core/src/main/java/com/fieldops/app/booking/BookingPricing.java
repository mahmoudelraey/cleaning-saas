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
import com.fieldops.app.catalog.ServiceOption;
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

    /**
     * @param optionId  the chosen option; required when the service has active options, ignored otherwise
     * @param quantity  FIXED: count (default 1), HOURLY: hours, PER_SQM: square metres.
     */
    public record Line(UUID serviceId, UUID optionId, BigDecimal quantity, List<UUID> addonIds) {
        /** A line for a service without options. */
        public Line(UUID serviceId, BigDecimal quantity, List<UUID> addonIds) {
            this(serviceId, null, quantity, addonIds);
        }
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
            ServiceOption option = optionFor(service, line.optionId());
            BookingItem main = new BookingItem(service.getId(), option == null ? null : option.getId(), null,
                    BookingItem.describe(service.getName(), option == null ? null : option.getName()), qty,
                    option == null ? service.getBasePriceHalalas() : option.getPriceHalalas());
            items.add(main);
            subtotal += main.getTotalHalalas();
            duration += durationFor(service, option, qty);

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

    /**
     * The line's option: required (and must be active) when the service has active options; a service without
     * options ignores any option id sent.
     */
    private static ServiceOption optionFor(ServiceOffering service, UUID optionId) {
        List<ServiceOption> active = service.getActiveOptions();
        if (active.isEmpty()) {
            return null;
        }
        if (optionId == null) {
            throw ApiException.badRequest("option_required", "Choose an option for " + service.getName());
        }
        return active.stream()
                .filter(o -> o.getId().equals(optionId))
                .findFirst()
                .orElseThrow(() -> ApiException.badRequest("invalid_option", "Option not available for this service"));
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

    /**
     * FIXED: duration × count, HOURLY: the hours booked, PER_SQM: the service's estimate. The option's duration,
     * when set, replaces the service's.
     */
    private static int durationFor(ServiceOffering service, ServiceOption option, BigDecimal qty) {
        int unit = option != null && option.getDurationMin() != null ? option.getDurationMin() : service.getDurationMin();
        return switch (service.getPricingType()) {
            case FIXED -> unit * qty.intValueExact();
            case HOURLY -> qty.multiply(BigDecimal.valueOf(60)).setScale(0, java.math.RoundingMode.CEILING).intValue();
            case PER_SQM -> unit;
        };
    }
}
