package com.fieldops.app.promo;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Promotions (discount codes). Coordinators with the Services screen can see them; only owners change them. */
@RestController
@RequestMapping("/api/v1/promos")
@PreAuthorize("hasAnyRole('OWNER','COORDINATOR')")
public class PromoController {

    private final PromoService promos;

    public PromoController(PromoService promos) {
        this.promos = promos;
    }

    @GetMapping
    public List<PromoDto> list() {
        return promos.list().stream().map(PromoDto::of).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('OWNER')")
    public PromoDto create(@Valid @RequestBody PromoRequest req) {
        return PromoDto.of(promos.create(req.toData()));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('OWNER')")
    public PromoDto update(@PathVariable UUID id, @Valid @RequestBody PromoRequest req) {
        return PromoDto.of(promos.update(id, req.toData()));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasRole('OWNER')")
    public void delete(@PathVariable UUID id) {
        promos.delete(id);
    }

    /**
     * @param discountValue a percent (1-100) for PERCENT, halalas for AMOUNT
     * @param endsAt the moment it stops working (the admin app sends midnight after the last day)
     */
    public record PromoRequest(@NotBlank @Size(max = 30) String code, @NotBlank @Size(max = 150) String title,
                               @Size(max = 150) String titleEn, @NotNull Promo.DiscountType discountType,
                               long discountValue, Long maxDiscountHalalas, Long minSubtotalHalalas, Instant startsAt,
                               Instant endsAt, Integer usageLimit, Integer perCustomerLimit, boolean firstBookingOnly,
                               boolean active, boolean announce) {
        PromoService.PromoData toData() {
            return new PromoService.PromoData(code, title, titleEn, discountType, discountValue, maxDiscountHalalas,
                    minSubtotalHalalas, startsAt, endsAt, usageLimit, perCustomerLimit, firstBookingOnly, active, announce);
        }
    }

    public record PromoDto(UUID id, String code, String title, String titleEn, Promo.DiscountType discountType,
                           long discountValue, Long maxDiscountHalalas, long minSubtotalHalalas, Instant startsAt,
                           Instant endsAt, Integer usageLimit, Integer perCustomerLimit, boolean firstBookingOnly,
                           boolean active, boolean announce, long usedCount, Instant createdAt) {
        static PromoDto of(PromoService.PromoView v) {
            Promo p = v.promo();
            return new PromoDto(p.getId(), p.getCode(), p.getTitle(), p.getTitleEn(), p.getDiscountType(),
                    p.getDiscountValue(), p.getMaxDiscountHalalas(), p.getMinSubtotalHalalas(), p.getStartsAt(),
                    p.getEndsAt(), p.getUsageLimit(), p.getPerCustomerLimit(), p.isFirstBookingOnly(), p.isActive(),
                    p.isAnnounce(), v.usedCount(), p.getCreatedAt());
        }
    }
}
