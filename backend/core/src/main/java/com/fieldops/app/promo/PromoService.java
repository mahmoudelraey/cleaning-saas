package com.fieldops.app.promo;

import java.time.Clock;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

import com.fieldops.app.booking.BookingStatus;
import com.fieldops.app.common.web.ApiException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Promotions: the office manages them (admin app); the portal checks a code against a booking and shows the
 * announced one. All calls run inside the company's tenant context.
 */
@Service
public class PromoService {

    private static final Pattern CODE = Pattern.compile("^[A-Z0-9-]{3,30}$");
    /** A cancelled booking gives its use back. */
    private static final Set<BookingStatus> NOT_COUNTED = Set.of(BookingStatus.CANCELLED);

    private final PromoRepository promos;
    private final Clock clock;

    public PromoService(PromoRepository promos, Clock clock) {
        this.promos = promos;
        this.clock = clock;
    }

    public record PromoData(String code, String title, String titleEn, Promo.DiscountType discountType, long discountValue,
                            Long maxDiscountHalalas, Long minSubtotalHalalas, Instant startsAt, Instant endsAt,
                            Integer usageLimit, Integer perCustomerLimit, boolean firstBookingOnly, boolean active,
                            boolean announce) {
    }

    /** A promo with how many bookings used it. */
    public record PromoView(Promo promo, long usedCount) {
    }

    /** A code that applies to a booking, and what it takes off. */
    public record Applied(Promo promo, long discountHalalas) {
    }

    // --- office --------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<PromoView> list() {
        List<Promo> all = promos.findAllByOrderByCreatedAtDesc();
        Map<UUID, Long> used = new HashMap<>();
        if (!all.isEmpty()) {
            for (Object[] row : promos.countUsesByPromo(all.stream().map(Promo::getId).toList(), NOT_COUNTED)) {
                used.put((UUID) row[0], (Long) row[1]);
            }
        }
        return all.stream().map(p -> new PromoView(p, used.getOrDefault(p.getId(), 0L))).toList();
    }

    @Transactional
    public PromoView create(PromoData d) {
        String code = normalize(d.code());
        validate(code, d);
        if (promos.findByCode(code).isPresent()) {
            throw taken();
        }
        Promo p = new Promo(code);
        apply(p, code, d);
        try {
            promos.saveAndFlush(p);
        } catch (DataIntegrityViolationException e) {
            throw taken(); // created by someone else at the same moment
        }
        return new PromoView(p, 0);
    }

    @Transactional
    public PromoView update(UUID id, PromoData d) {
        Promo p = get(id);
        String code = normalize(d.code());
        validate(code, d);
        promos.findByCode(code).filter(other -> !other.getId().equals(id)).ifPresent(other -> {
            throw taken();
        });
        apply(p, code, d);
        try {
            promos.flush();
        } catch (DataIntegrityViolationException e) {
            throw taken();
        }
        return new PromoView(p, promos.countUses(id, NOT_COUNTED));
    }

    /** Bookings that used it keep their code and discount (the link is cleared by the database). */
    @Transactional
    public void delete(UUID id) {
        promos.delete(get(id));
    }

    // --- portal --------------------------------------------------------------------------------------

    /** The newest announced promo that a customer could use right now, if any. */
    @Transactional(readOnly = true)
    public Optional<Promo> announced() {
        Instant now = Instant.now(clock);
        return promos.findByAnnounceTrueAndActiveTrueOrderByCreatedAtDesc().stream()
                .filter(p -> p.liveAt(now))
                .filter(p -> p.getUsageLimit() == null || promos.countUses(p.getId(), NOT_COUNTED) < p.getUsageLimit())
                .findFirst();
    }

    /**
     * Checks {@code rawCode} for a booking of {@code subtotal} halalas by {@code customerId} (null for a visitor:
     * the per-customer rules are then checked when booking). Throws an {@link ApiException} whose code says why it
     * does not apply: promo_not_found, promo_inactive, promo_not_started, promo_expired, promo_used_up,
     * promo_customer_limit, promo_first_booking, promo_min_subtotal.
     *
     * @param forBooking lock the promo until the booking's transaction ends, so limits hold under concurrent bookings
     */
    @Transactional
    public Applied check(String rawCode, UUID customerId, long subtotal, boolean forBooking) {
        String code = normalize(rawCode);
        if (code.isEmpty()) {
            throw ApiException.notFound("promo");
        }
        Promo p = (forBooking ? promos.findByCodeForUpdate(code) : promos.findByCode(code))
                .orElseThrow(() -> ApiException.notFound("promo"));
        Instant now = Instant.now(clock);
        if (!p.isActive()) {
            throw refused("promo_inactive", "This promo is paused");
        }
        if (p.getStartsAt() != null && p.getStartsAt().isAfter(now)) {
            throw refused("promo_not_started", "This promo hasn't started yet");
        }
        if (p.getEndsAt() != null && !p.getEndsAt().isAfter(now)) {
            throw refused("promo_expired", "This promo has ended");
        }
        if (p.getUsageLimit() != null && promos.countUses(p.getId(), NOT_COUNTED) >= p.getUsageLimit()) {
            throw refused("promo_used_up", "This promo has been fully used");
        }
        if (customerId != null) {
            if (p.getPerCustomerLimit() != null
                    && promos.countUsesBy(p.getId(), customerId, NOT_COUNTED) >= p.getPerCustomerLimit()) {
                throw refused("promo_customer_limit", "You have already used this promo");
            }
            if (p.isFirstBookingOnly() && promos.countBookingsOf(customerId, NOT_COUNTED) > 0) {
                throw refused("promo_first_booking", "This promo is for a first booking only");
            }
        }
        if (subtotal < p.getMinSubtotalHalalas()) {
            throw refused("promo_min_subtotal", "The order is below this promo's minimum");
        }
        return new Applied(p, p.discountOn(subtotal));
    }

    // ---------------------------------------------------------------------------------------------

    private Promo get(UUID id) {
        return promos.findById(id).orElseThrow(() -> ApiException.notFound("promo"));
    }

    public static String normalize(String raw) {
        return raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT).replaceAll("\\s+", "");
    }

    private static void validate(String code, PromoData d) {
        if (!CODE.matcher(code).matches()) {
            throw invalid("Use 3-30 letters, digits or dashes for the code");
        }
        if (d.title() == null || d.title().isBlank() || d.title().trim().length() > 150
                || (d.titleEn() != null && d.titleEn().trim().length() > 150)) {
            throw invalid("Enter the promo text (up to 150 characters)");
        }
        if (d.discountType() == null || d.discountValue() <= 0
                || (d.discountType() == Promo.DiscountType.PERCENT && d.discountValue() > 100)) {
            throw invalid("The discount must be 1-100% or an amount above zero");
        }
        if ((d.maxDiscountHalalas() != null && d.maxDiscountHalalas() <= 0)
                || (d.minSubtotalHalalas() != null && d.minSubtotalHalalas() < 0)) {
            throw invalid("Amounts must be above zero");
        }
        if (d.startsAt() != null && d.endsAt() != null && !d.endsAt().isAfter(d.startsAt())) {
            throw invalid("The last day must be after the first");
        }
        if ((d.usageLimit() != null && d.usageLimit() <= 0) || (d.perCustomerLimit() != null && d.perCustomerLimit() <= 0)) {
            throw invalid("Limits must be at least 1");
        }
    }

    private static void apply(Promo p, String code, PromoData d) {
        p.update(code, d.title().trim(), blankToNull(d.titleEn()), d.discountType(), d.discountValue(),
                d.maxDiscountHalalas(), d.minSubtotalHalalas() == null ? 0 : d.minSubtotalHalalas(), d.startsAt(),
                d.endsAt(), d.usageLimit(), d.perCustomerLimit(), d.firstBookingOnly(), d.active(), d.announce());
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static ApiException taken() {
        return ApiException.conflict("promo_code_taken", "Another promo already uses this code");
    }

    private static ApiException invalid(String message) {
        return ApiException.badRequest("promo_invalid", message);
    }

    private static ApiException refused(String code, String message) {
        return ApiException.conflict(code, message);
    }
}
